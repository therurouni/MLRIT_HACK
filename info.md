# SEFS — Semantic Entropy File System
### Repository: [therurouni/MLRIT_HACK](https://github.com/therurouni/MLRIT_HACK)
> A full-stack AI-powered file management system built for the MLRIT Hackathon.

---

## 📁 Repository Structure

```
MLRIT_HACK/
├── index.html               # Cinematic scroll-driven landing page (standalone)
├── frames/                  # 192 JPEG frames for the scroll animation
├── pyproject.toml           # Python project config & dependencies
├── start.sh                 # One-click startup script (Linux/macOS)
├── start.ps1                # One-click startup script (Windows PowerShell)
├── .env                     # Environment variable overrides
├── .gitignore
├── backend/                 # Python FastAPI backend
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # All settings, paths, model names
│   ├── database.py          # SQLite schema + async CRUD (aiosqlite)
│   ├── embeddings.py        # Ollama nomic-embed-text client
│   ├── vector_store.py      # FAISS IndexFlatIP wrapper
│   ├── watcher.py           # Watchdog folder watcher → embed → cluster
│   ├── file_reader.py       # Text extraction: PDF, DOCX, PPTX, XLSX, OCR
│   ├── clustering.py        # Agglomerative clustering + UMAP projection
│   ├── cluster_namer.py     # LLM-based cluster naming via Ollama
│   ├── rag.py               # RAG chat: FAISS retrieve + llama3.2 generate
│   ├── websocket.py         # WebSocket ConnectionManager (real-time events)
│   ├── file_organizer.py    # Move/copy files into cluster folders
│   ├── basic_organizer.py   # Organize files by extension type
│   └── routers/
│       ├── __init__.py
│       ├── files.py         # /api/files — list, scan, root, organize, stats
│       ├── clusters.py      # /api/clusters — cluster, graph, UMAP, timeline
│       ├── search.py        # /api/search — hybrid semantic + keyword search
│       └── chat.py          # /api/chat — RAG chatbot + history
└── frontend/                # React + TypeScript + Vite frontend
    ├── index.html           # Vite HTML entry
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── main.tsx         # Entry → CinematicIntro → App
        ├── App.tsx          # Root component + global state
        ├── api.ts           # All typed fetch wrappers
        ├── types.ts         # Shared TypeScript interfaces
        ├── index.css        # Tailwind + global styles
        ├── hooks/
        │   └── useWebSocket.ts  # WebSocket hook for live updates
        └── components/
            ├── TopNav.tsx
            ├── FileList.tsx
            ├── ForceGraph.tsx       # D3 force-directed cluster graph
            ├── UmapView.tsx         # 2D UMAP scatter plot
            ├── SpatialView.tsx      # Spatial file explorer
            ├── ChatPanel.tsx        # RAG chatbot UI
            ├── SearchBar.tsx
            ├── SearchModal.tsx      # Cmd+K search palette
            ├── FileDetailsPanel.tsx
            ├── ActivityBar.tsx
            ├── SettingsDrawer.tsx
            ├── GapAnalysisPanel.tsx # LLM knowledge gap detection
            ├── HandTracker.tsx      # MediaPipe hand gesture navigation
            ├── TimelineView.tsx     # Chronological activity timeline
            └── CinematicIntro.tsx   # Scroll-driven animated intro
```

---

## 🏗 Architecture Overview

```
Browser
  │
  ├── index.html  (Standalone cinematic landing — 192 scroll-animated JPEG frames)
  │
  └── frontend/ (React SPA @ localhost:5173)
        │
        │  REST API + WebSocket
        ▼
    backend/ (FastAPI @ localhost:8484)
        │
        ├── SQLite DB  (~/.sefs-root/.sefs-data/sefs.db)
        ├── FAISS Index (~/.sefs-root/.sefs-data/embeddings.faiss)
        └── Ollama (localhost:11434)
              ├── nomic-embed-text:latest  →  768-dim embeddings
              └── llama3.2:latest          →  cluster naming + RAG chat
```

---

## 🐍 Backend — File by File

### `backend/main.py`
FastAPI application entry point. Handles:
- **Lifespan** (startup/shutdown): DB init → FAISS load → Ollama health check → start file watcher
- **CORS** middleware (allows `localhost:5173`)
- **Router registration**: files, clusters, search, chat
- **WebSocket** endpoint at `/ws` for real-time push events

### `backend/config.py`
Central configuration loaded from `.env`. Key settings:
| Variable | Default | Description |
|---|---|---|
| `SEFS_ROOT` | `~/sefs-root` | Folder to watch and organize |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `SEFS_EMBED_MODEL` | `nomic-embed-text:latest` | Embedding model |
| `SEFS_LLM_MODEL` | `llama3.2:latest` | LLM for naming + chat |
| `SEFS_CLUSTER_THRESHOLD` | `0.3` | Cosine distance threshold for clustering |
| `API_PORT` | `8484` | Backend HTTP port |
| `EMBED_DIMENSION` | `768` | nomic-embed-text output dimension |

### `backend/database.py`
SQLite via `aiosqlite` with WAL mode. Schema:

| Table | Purpose |
|---|---|
| `files` | File metadata: path, name, extension, size, hash, preview, faiss_id, cluster_id |
| `clusters` | Cluster records: name, label, file_count, folder_path |
| `events` | System event log (file added, clustered, etc.) |
| `chat_history` | RAG chat messages: role, content, context_files |

### `backend/embeddings.py`
- Calls Ollama `/api/embeddings` with `nomic-embed-text`
- Returns `numpy.ndarray` of shape `(768,)` as `float32`
- Truncates input to 32,000 chars (~8,000 tokens)
- Includes health check (`/api/tags`) and graceful fallback

### `backend/vector_store.py`
- Wraps **FAISS `IndexFlatIP`** (inner product / cosine similarity)
- Methods: `add(embedding)`, `search(query, k)`, `save()`, `load_or_create()`
- Persists index to `embeddings.faiss` on disk

### `backend/watcher.py`
- Uses **Watchdog** to monitor `SEFS_ROOT` for `FileCreated`, `FileModified`, `FileDeleted`
- On new/changed file: read → hash → upsert DB → embed → add to FAISS → broadcast WS event
- Ignores hidden files, `.sefs-data/`, `node_modules/`, etc.
- Supports: text, PDF, DOCX, PPTX, XLSX, images, all code file types

### `backend/file_reader.py`
Multi-format text extraction:
| Format | Library |
|---|---|
| Plain text | `chardet` (encoding detection) |
| PDF | `PyMuPDF (fitz)` |
| DOCX | `python-docx` |
| PPTX | `python-pptx` |
| Excel | `openpyxl` |
| Images | `Pillow` + `pytesseract` (OCR, requires Tesseract binary) |

### `backend/clustering.py`
- **Agglomerative Clustering** (sklearn) with cosine distance and average linkage
- `distance_threshold=0.3` → auto-determines cluster count (no fixed k)
- Every file gets a cluster (no noise label)
- **UMAP** dimensionality reduction to 2D for visualization
- Dynamic `n_neighbors = min(15, n_files - 1)` to handle small datasets

### `backend/cluster_namer.py`
- Sends cluster filenames to Ollama `llama3.2` with a prompt asking for a 2-3 word descriptive name
- Updates cluster names in SQLite

### `backend/rag.py`
RAG pipeline:
1. Embed user query via `nomic-embed-text`
2. Search FAISS for top-k relevant files
3. Build prompt with file content previews as context
4. Stream response from `llama3.2` via Ollama `/api/generate`
5. Save user + assistant messages to `chat_history`

### `backend/websocket.py`
- `ConnectionManager` singleton (`ws_manager`)
- `broadcast(event_type, data)` → pushes JSON to all connected clients
- Events: `file_added`, `clustering_started`, `clustering_complete`, `naming_complete`, `organizing_complete`, etc.

### `backend/routers/files.py` — `/api/files`
| Endpoint | Method | Description |
|---|---|---|
| `/api/files` | GET | List all tracked files |
| `/api/files/{id}` | GET | Get file by ID |
| `/api/files/root` | GET | Get current watch root |
| `/api/files/root` | POST | Change watch root (restarts watcher) |
| `/api/files/scan` | POST | Scan directory → embed → cluster |
| `/api/files/basic-organize` | POST | Organize by file extension type |
| `/api/files/stats/summary` | GET | Total/embedded/clustered file counts |
| `/api/files/{id}/similar` | GET | Find semantically similar files |

### `backend/routers/clusters.py` — `/api/clusters`
| Endpoint | Method | Description |
|---|---|---|
| `/api/clusters` | GET | List all clusters |
| `/api/clusters/recluster` | POST | Re-run clustering pipeline |
| `/api/clusters/graph` | GET | Force graph data (nodes + links) |
| `/api/clusters/umap` | GET | UMAP 2D coordinates |
| `/api/clusters/timeline` | GET | Chronological event feed |
| `/api/clusters/organize` | POST | Move files into cluster folders |
| `/api/clusters/gap-analysis` | GET | LLM-based knowledge gap detection |

### `backend/routers/search.py` — `/api/search`
Hybrid search:
1. **Semantic**: FAISS cosine similarity (when Ollama available)
2. **Keyword**: SQLite `LIKE` full-text search (always runs)
3. **Merge**: weighted combination score `0.7 * semantic + 0.3 * keyword`

### `backend/routers/chat.py` — `/api/chat`
| Endpoint | Method | Description |
|---|---|---|
| `/api/chat` | POST | Send message → RAG response |
| `/api/chat/history` | GET | Retrieve chat history |
| `/api/chat/history` | DELETE | Clear chat history |

---

## ⚛️ Frontend — File by File

### `frontend/src/main.tsx`
Entry point. Renders a `Root` component that:
1. Shows `CinematicIntro` first (scroll-animated intro)
2. On completion → renders main `App`

### `frontend/src/App.tsx`
Root component managing:
- **Active tab**: `graph | files | umap | timeline | search | chat | gaps`
- **Global state**: files list, root path, cluster count, Ollama status
- **WebSocket** subscription via `useWebSocket` hook
- **Keyboard shortcut**: `Cmd+K` / `Ctrl+K` opens search modal

### `frontend/src/api.ts`
All typed API wrappers using `fetch`. Covers every backend endpoint: files, clusters, search, chat, stats, graph data, UMAP, timeline, gap analysis.

### `frontend/src/types.ts`
Shared TypeScript interfaces:
- `FileRecord`, `Cluster`, `GraphNode`, `GraphLink`, `GraphData`
- `UmapPoint`, `TimelineEntry`, `TimelineData`
- `SearchResult`, `ChatMessage`, `WSEvent`, `EventRecord`
- `ViewTab`, `GapTopic`, `GapAnalysisResult`

### Key Components

| Component | Description |
|---|---|
| `ForceGraph.tsx` | D3 force-directed graph — files as nodes, edges between same-cluster files, colored by cluster |
| `UmapView.tsx` | Interactive 2D UMAP scatter plot — hover to preview files |
| `SpatialView.tsx` | Spatial file explorer |
| `ChatPanel.tsx` | RAG chatbot — send messages, see context files used, clear history |
| `SearchModal.tsx` | Cmd+K command palette — hybrid semantic+keyword search with instant results |
| `GapAnalysisPanel.tsx` | Calls LLM to detect topic gaps in your file knowledge base |
| `TimelineView.tsx` | Chronological feed of file additions, cluster creations, events |
| `ActivityBar.tsx` | Live event sidebar from WebSocket stream |
| `FileDetailsPanel.tsx` | File metadata, cluster info, similar files panel |
| `SettingsDrawer.tsx` | Root directory change, scan + organize options |
| `HandTracker.tsx` | Experimental: MediaPipe hand tracking for gesture-based navigation |
| `CinematicIntro.tsx` | React reimplementation of the scroll-animated intro |

---

## 🎥 Cinematic Landing Page (`index.html`)

A **zero-dependency standalone HTML page**:

- Preloads **192 JPEG frames** from `frames/ezgif-frame-001.jpg` → `frames/ezgif-frame-192.jpg`
- Plays frames on scroll: **6px of scroll = 1 frame** (1,152px total scroll height)
- Full-screen `<canvas>` renders each frame with CSS `object-fit: cover` behavior
- **Film grain** SVG overlay for cinematic texture
- **Progress bar** at bottom tracks scroll position
- **Scroll hint** indicator that hides after 80px scroll
- **CTA section** fades in at 98% scroll completion: "Step Into Something Extraordinary"
- Fonts: `Playfair Display` (serif) + `JetBrains Mono` (monospace)

---

## 📦 Python Dependencies (`pyproject.toml`)

| Category | Packages |
|---|---|
| Web framework | `fastapi`, `uvicorn[standard]`, `websockets`, `httpx`, `pydantic` |
| Database | `aiosqlite` |
| Vector store | `faiss-cpu` |
| Numerics | `numpy<2.0`, `scipy` |
| Clustering | `hdbscan`, `umap-learn`, `scikit-learn` |
| File watching | `watchdog` |
| File reading | `pymupdf`, `python-docx`, `python-pptx`, `openpyxl`, `Pillow`, `pytesseract` |
| Utilities | `aiofiles`, `chardet`, `python-dotenv` |

Requires **Python 3.11** exactly (`>=3.11,<3.12`).

---

## 🚀 How to Run

### Prerequisites
- [Ollama](https://ollama.com) installed and running
- Python 3.11
- Node.js 18+
- [`uv`](https://astral.sh/uv) (fast Python package manager)

### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

### Windows (PowerShell)
```powershell
.
start.ps1
```

The startup script automatically:
1. Checks / starts Ollama
2. Pulls `nomic-embed-text:latest` and `llama3.2:latest`
3. Creates Python 3.11 venv and installs all dependencies
4. Creates the default `~/sefs-root` watch folder
5. Starts the backend (port 8484) and frontend (port 5173)

### URLs
| Service | URL |
|---|---|
| Frontend App | http://localhost:5173 |
| Backend API | http://localhost:8484 |
| API Docs (Swagger) | http://localhost:8484/docs |

---

## 🔑 Environment Variables (`.env`)

```env
SEFS_ROOT=~/sefs-root           # Folder to monitor and organize
OLLAMA_BASE_URL=http://localhost:11434
SEFS_EMBED_MODEL=nomic-embed-text:latest
SEFS_LLM_MODEL=llama3.2:latest
SEFS_CLUSTER_THRESHOLD=0.3      # Lower = more clusters (stricter)
```

---

## 🗄 Database Schema

```sql
files (id, path, filename, extension, size_bytes, content_hash,
       content_preview, faiss_id, cluster_id, cluster_name,
       embedded_at, created_at, updated_at)

clusters (id, name, label, file_count, folder_path, created_at, updated_at)

events (id, event_type, data, created_at)

chat_history (id, role, content, context_files, created_at)
```

---

## 🤖 AI Pipeline Flow

```
File added/modified to SEFS_ROOT
        ↓
  Watchdog detects change
        ↓
  Read file content (PDF/DOCX/text/image OCR)
        ↓
  SHA-256 hash → skip if unchanged
        ↓
  nomic-embed-text → 768-dim vector
        ↓
  FAISS IndexFlatIP → store embedding
        ↓
  Agglomerative clustering (cosine, threshold=0.3)
        ↓
  llama3.2 names each cluster
        ↓
  UMAP 2D projection for visualization
        ↓
  WebSocket broadcast → frontend updates live
```

---

*Generated by GitHub Copilot — 2026-03-08*