"""
SEFS Backend — FastAPI application entry point.
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import backend.config as config
from backend.config import CORS_ORIGINS
from backend.database import init_db, get_recent_events
from backend.vector_store import vector_store
from backend.watcher import start_watcher, stop_watcher
from backend.websocket import ws_manager
from backend.embeddings import check_ollama_health, close_client as close_embed_client
from backend.cluster_namer import close_client as close_namer_client
from backend.rag import close_client as close_rag_client

from backend.routers.files import router as files_router
from backend.routers.clusters import router as clusters_router
from backend.routers.search import router as search_router
from backend.routers.chat import router as chat_router

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("sefs")


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    logger.info("=" * 60)
    logger.info("SEFS — Semantic Entropy File System")
    logger.info(f"Root folder: {config.SEFS_ROOT}")
    logger.info("=" * 60)

    # 1. Initialize database
    await init_db()
    logger.info("Database initialized")

    # 2. Load or create FAISS index
    vector_store.load_or_create()
    logger.info(f"Vector store ready ({vector_store.total} vectors)")

    # 3. Check Ollama health
    healthy = await check_ollama_health()
    if healthy:
        logger.info("Ollama connection OK")
    else:
        logger.warning("Ollama not available — embedding/chat will fail until Ollama is running")

    # 4. Start file watcher
    loop = asyncio.get_running_loop()
    start_watcher(config.SEFS_ROOT, loop)
    logger.info("File watcher started")

    logger.info("SEFS is ready! API at http://localhost:8484/docs")

    yield

    # Shutdown
    logger.info("Shutting down SEFS...")
    stop_watcher()
    await close_embed_client()
    await close_namer_client()
    await close_rag_client()
    vector_store.save()
    logger.info("SEFS shut down cleanly")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SEFS API",
    description="Semantic Entropy File System — cluster, organize, and chat with your files",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(files_router)
app.include_router(clusters_router)
app.include_router(search_router)
app.include_router(chat_router)


# ─── WebSocket endpoint ──────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send recent events on connect
        events = await get_recent_events(limit=10)
        await ws_manager.send_personal(websocket, "connected", {
            "message": "Connected to SEFS",
            "recent_events": events,
        })

        # Keep connection alive, listen for pings
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await ws_manager.send_personal(websocket, "pong", {})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    ollama_ok = await check_ollama_health()
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "vectors": vector_store.total,
        "root": str(config.SEFS_ROOT),
    }


# Alias routes for common 404s
@app.get("/api/status")
async def status_alias():
    """Alias for /api/health."""
    return await health()


@app.get("/api/graph")
async def graph_alias():
    """Alias for /api/clusters/graph."""
    from backend.routers.clusters import get_graph
    return await get_graph()


@app.get("/api/events")
async def get_events(limit: int = 50):
    """Get recent events."""
    events = await get_recent_events(limit=limit)
    return {"events": events}


# ─── Serve frontend static files ─────────────────────────────────────────────

_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    # Serve built assets (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Catch-all: serve the SPA index.html for any non-API route."""
        # Try serving a specific file first
        file_path = _FRONTEND_DIST / full_path
        if full_path and file_path.is_file() and file_path.resolve().is_relative_to(_FRONTEND_DIST.resolve()):
            return FileResponse(str(file_path))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
