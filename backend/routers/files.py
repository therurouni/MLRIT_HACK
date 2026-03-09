"""
SEFS Files Router — file listing, scanning, and file detail endpoints.
"""

import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from backend import database as db
import backend.config as config
from backend.watcher import scan_directory
from backend.websocket import ws_manager

logger = logging.getLogger("sefs.routers.files")
router = APIRouter(prefix="/api/files", tags=["files"])


class ScanRequest(BaseModel):
    root: Optional[str] = None
    semantic_organize: bool = False


class BasicOrganizeRequest(BaseModel):
    root: Optional[str] = None


class SetRootRequest(BaseModel):
    root: str


@router.get("")
async def list_files():
    """List all tracked files."""
    files = await db.get_all_files()
    return {"files": files, "total": len(files)}


@router.get("/root")
async def get_root():
    """Get the current root directory."""
    return {"root": str(config.SEFS_ROOT)}


@router.post("/root")
async def set_root(req: SetRootRequest):
    """Set a new root directory (updates config at runtime)."""
    from backend.database import init_db
    from backend.vector_store import vector_store
    from backend.watcher import stop_watcher, start_watcher

    new_root = Path(req.root).expanduser().resolve()
    if not new_root.exists():
        new_root.mkdir(parents=True, exist_ok=True)

    # 1. Update all config paths
    config.SEFS_ROOT = new_root
    config.DATA_DIR = new_root / ".sefs-data"
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.FAISS_INDEX_PATH = config.DATA_DIR / "embeddings.faiss"
    config.SQLITE_DB_PATH = config.DATA_DIR / "sefs.db"

    # 2. Reinitialize DB for the new root
    await init_db()

    # 3. Reload/create FAISS index for the new root
    vector_store.load_or_create()

    # 4. Restart file watcher on new root
    stop_watcher()
    import asyncio
    loop = asyncio.get_running_loop()
    start_watcher(new_root, loop)

    logger.info(f"Root changed to {new_root}")
    return {"root": str(new_root), "status": "updated"}


@router.post("/basic-organize")
async def basic_organize_files(req: BasicOrganizeRequest, background_tasks: BackgroundTasks):
    """Organize files by extension type (Images, Documents, Code, etc.) — no scan/cluster."""
    root = Path(req.root) if req.root else config.SEFS_ROOT
    if not root.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {root}")

    background_tasks.add_task(_run_basic_organize, root)
    return {"status": "basic_organize_started", "root": str(root)}


async def _run_basic_organize(root: Path):
    """Background basic-organize task."""
    try:
        from backend.basic_organizer import basic_organize as do_basic_organize
        await do_basic_organize(root)
    except Exception as e:
        logger.error(f"Basic organize failed: {e}")
        await ws_manager.broadcast("basic_organize_error", {"error": str(e)})


@router.post("/scan")
async def scan_files(req: ScanRequest, background_tasks: BackgroundTasks):
    """Trigger a full directory scan (for semantic clustering pipeline)."""
    root = Path(req.root) if req.root else config.SEFS_ROOT
    if not root.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {root}")

    # Run scan in background
    background_tasks.add_task(_run_scan, root, req.semantic_organize)
    return {
        "status": "scan_started",
        "root": str(root),
        "semantic_organize": req.semantic_organize,
    }


async def _run_scan(
    root: Path,
    semantic_organize: bool = False,
):
    """Background scan task."""
    try:
        file_ids = await scan_directory(root)
        # scan_directory() already broadcasts scan_complete

        # Store the organize flag so the clustering pipeline can pick it up
        _scan_flags["semantic_organize"] = semantic_organize
    except Exception as e:
        logger.error(f"Scan failed: {e}")
        await ws_manager.broadcast("scan_error", {"error": str(e)})


# Shared state: flags from the latest scan for the clustering step
_scan_flags: dict = {"semantic_organize": False}


@router.get("/stats/summary")
async def file_stats():
    """Get file statistics."""
    files = await db.get_all_files()
    embedded = [f for f in files if f.get("faiss_id") is not None]
    clustered = [f for f in files if f.get("cluster_id") is not None and f["cluster_id"] >= 0]

    return {
        "total_files": len(files),
        "embedded_files": len(embedded),
        "clustered_files": len(clustered),
        "root": str(config.SEFS_ROOT),
    }


@router.get("/scan-flags")
async def get_scan_flags():
    """Get the organize flags from the latest scan."""
    return _scan_flags


@router.get("/{file_id}")
async def get_file(file_id: int):
    """Get a single file by ID."""
    file_rec = await db.get_file_by_id(file_id)
    if not file_rec:
        raise HTTPException(status_code=404, detail="File not found")
    return file_rec


@router.get("/{file_id}/similar")
async def get_similar_files(file_id: int, k: int = 5):
    """Find files most similar to a given file using vector similarity."""
    from backend.vector_store import vector_store
    import numpy as np

    file_rec = await db.get_file_by_id(file_id)
    if not file_rec:
        raise HTTPException(status_code=404, detail="File not found")

    faiss_id = file_rec.get("faiss_id")
    if faiss_id is None:
        return {"similar": [], "file_id": file_id}

    try:
        embedding = vector_store.index.reconstruct(faiss_id)
        results = vector_store.search(np.array(embedding), k=k + 1)
    except Exception:
        return {"similar": [], "file_id": file_id}

    embedded_files = await db.get_embedded_files()
    faiss_to_file = {f["faiss_id"]: f for f in embedded_files}

    similar = []
    for fid, score in results:
        if fid == faiss_id:
            continue
        f = faiss_to_file.get(fid)
        if f:
            similar.append({
                "file_id": f["id"],
                "filename": f["filename"],
                "path": f["path"],
                "extension": f.get("extension", ""),
                "cluster_id": f.get("cluster_id"),
                "cluster_name": f.get("cluster_name", ""),
                "score": round(score, 4),
            })

    return {"similar": similar[:k], "file_id": file_id}


@router.post("/{file_id}/open")
async def open_file_in_system(file_id: int):
    """Open a file in the system's default application."""
    import platform
    import subprocess

    file_rec = await db.get_file_by_id(file_id)
    if not file_rec:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = file_rec.get("path")
    if not file_path:
        raise HTTPException(status_code=400, detail="File path not available")

    try:
        system = platform.system()
        if system == "Windows":
            # Use start command on Windows
            subprocess.Popen(["cmd", "/c", "start", "", file_path], shell=True)
        elif system == "Darwin":  # macOS
            subprocess.Popen(["open", file_path])
        else:  # Linux and others
            subprocess.Popen(["xdg-open", file_path])
        
        return {"status": "opened", "file_id": file_id, "path": file_path}
    except Exception as e:
        logger.error(f"Failed to open file {file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open file: {str(e)}")
