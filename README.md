# SEFS — Semantic Entropy File System

> An AI-powered file management system that automatically clusters, organizes, and lets you chat with your files using local LLMs.

Built for the **MLRIT Hackathon** · [therurouni/MLRIT_HACK](https://github.com/therurouni/MLRIT_HACK)

---

## What It Does

Drop files into a folder. SEFS watches for changes, reads their content (text, PDF, DOCX, images via OCR), generates semantic embeddings, clusters similar files together, and names each cluster using AI — all running **locally** with [Ollama](https://ollama.com).

**Visualize** your files as a force-directed graph, spatial map, or activity timeline. **Search** semantically across everything. **Chat** with your files using RAG.

---

## Features

- **Automatic File Watching** — Watchdog monitors your folder in real-time; new/changed files are embedded and clustered instantly
- **Semantic Clustering** — Agglomerative clustering with cosine similarity groups related files without a fixed k
- **AI Cluster Naming** — llama3.2 generates descriptive 2–3 word names for each cluster
- **3 Visualization Modes** — Force-directed graph, spatial Voronoi view, chronological activity timeline
- **Hybrid Search** — Combined semantic (FAISS) + keyword (SQLite) search with Cmd+K palette
- **RAG Chat** — Ask questions about your files; the system retrieves relevant context and generates answers
- **Knowledge Gap Analysis** — LLM detects missing topics in your file collection
- **File Organization** — Sort by type (extension) or semantics (cluster) into clean folder structures
- **Multi-Format Support** — Plain text, PDF, DOCX, PPTX, XLSX, images (OCR), and 50+ code file types
- **Real-Time Updates** — WebSocket pushes pipeline events to the frontend as they happen
- **Hand Gesture Navigation** — Experimental MediaPipe hand tracking for gesture-based control
- **Cinematic Intro** — Scroll-driven 192-frame animated landing page

---

## Architecture

```
Frontend (React + Vite)           Backend (FastAPI)
localhost:5173                    localhost:8484
┌─────────────────┐              ┌──────────────────────────┐
│ ForceGraph       │   REST +    │  File Watcher (Watchdog)  │
│ SpatialView      │◄──WebSocket─┤  Embeddings   (Ollama)    │
│ TimelineView     │             │  FAISS Vector Store        │
│ ChatPanel        │             │  SQLite Database           │
│ SearchModal      │             │  Clustering   (sklearn)    │
│ GapAnalysis      │             │  RAG Pipeline (llama3.2)   │
└─────────────────┘              └──────────────────────────┘
                                          │
                                    Ollama (local)
                                 localhost:11434
                          ┌─────────────────────────┐
                          │ nomic-embed-text → 768d  │
                          │ llama3.2 → naming + chat │
                          └─────────────────────────┘
```

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| [Ollama](https://ollama.com) | Latest |
| Python | 3.11 |
| Node.js | 18+ |
| [uv](https://astral.sh/uv) | Latest (fast Python package manager) |

### One-Command Launch

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows (PowerShell):**
```powershell
.\start.ps1
```

The startup script automatically:
1. Checks and starts Ollama if needed
2. Pulls `nomic-embed-text:latest` and `llama3.2:latest` models
3. Creates a Python 3.11 virtual environment and installs dependencies
4. Creates the default `~/sefs-root` watch folder
5. Installs frontend npm packages
6. Starts the backend (port 8484) and frontend (port 5173)

### URLs

| Service | URL |
|---|---|
| Frontend App | http://localhost:5173 |
| Backend API | http://localhost:8484 |
| API Docs (Swagger) | http://localhost:8484/docs |

---

## Configuration

Create a `.env` file in the project root to override defaults:

```env
SEFS_ROOT=~/sefs-root                    # Folder to monitor and organize
OLLAMA_BASE_URL=http://localhost:11434    # Ollama server URL
SEFS_EMBED_MODEL=nomic-embed-text:latest # Embedding model
SEFS_LLM_MODEL=llama3.2:latest           # LLM for naming + chat
SEFS_CLUSTER_THRESHOLD=0.3               # Cosine distance threshold (lower = more clusters)
API_PORT=8484                             # Backend port
```

---

## How It Works

```
File added/modified in SEFS_ROOT
         │
         ▼
   Watchdog detects change
         │
         ▼
   Read content (PDF / DOCX / text / image OCR)
         │
         ▼
   SHA-256 hash — skip if unchanged
         │
         ▼
   nomic-embed-text → 768-dim vector
         │
         ▼
   FAISS IndexFlatIP stores embedding
         │
         ▼
   Agglomerative clustering (cosine, threshold=0.3)
         │
         ▼
   llama3.2 names each cluster
         │
         ▼
   UMAP 2D projection for visualization
         │
         ▼
   WebSocket broadcast → frontend updates live
```

---

## API Reference

### Files — `/api/files`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/files` | List all tracked files |
| GET | `/api/files/{id}` | Get file by ID |
| GET | `/api/files/root` | Get current watch root |
| POST | `/api/files/root` | Change watch root |
| POST | `/api/files/scan` | Scan directory, embed, and cluster |
| POST | `/api/files/basic-organize` | Organize by file extension type |
| GET | `/api/files/stats/summary` | File count statistics |
| GET | `/api/files/{id}/similar` | Find semantically similar files |
| POST | `/api/files/{id}/open` | Open file in system default app |

### Clusters — `/api/clusters`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/clusters` | List all clusters |
| POST | `/api/clusters/recluster` | Re-run the full clustering pipeline |
| GET | `/api/clusters/graph` | Force graph data (nodes + links) |
| GET | `/api/clusters/umap` | UMAP 2D coordinates |
| GET | `/api/clusters/timeline` | Chronological activity log |
| POST | `/api/clusters/organize` | Move files into cluster folders |
| GET | `/api/clusters/gap-analysis` | LLM knowledge gap detection |

### Search — `/api/search`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/search` | Hybrid semantic + keyword search |

### Chat — `/api/chat`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Send message, get RAG response |
| GET | `/api/chat/history` | Retrieve chat history |
| DELETE | `/api/chat/history` | Clear chat history |

---

## Database Schema

```sql
files       (id, path, filename, extension, size_bytes, content_hash,
             content_preview, faiss_id, cluster_id, cluster_name,
             embedded_at, created_at, updated_at)

clusters    (id, name, label, file_count, folder_path, created_at, updated_at)

events      (id, event_type, data, created_at)

chat_history(id, role, content, context_files, created_at)
```

---

## Tech Stack

### Backend

| Component | Technology |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Database | SQLite (aiosqlite, WAL mode) |
| Vector store | FAISS (IndexFlatIP) |
| Embeddings | Ollama + nomic-embed-text (768-dim) |
| LLM | Ollama + llama3.2 |
| Clustering | scikit-learn Agglomerative + UMAP |
| File watching | Watchdog |
| Document parsing | PyMuPDF, python-docx, python-pptx, openpyxl, pytesseract |

### Frontend

| Component | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Visualizations | D3.js |
| Hand tracking | MediaPipe Tasks Vision |
| Real-time | WebSocket |

---

## Project Structure

```
├── index.html              # Cinematic scroll-animated landing page
├── frames/                 # 192 JPEG frames for scroll animation
├── pyproject.toml          # Python dependencies
├── start.sh / start.ps1    # One-click startup scripts
├── backend/
│   ├── main.py             # FastAPI entry point + lifespan
│   ├── config.py           # Settings from .env
│   ├── database.py         # SQLite schema + async CRUD
│   ├── embeddings.py       # Ollama embedding client
│   ├── vector_store.py     # FAISS wrapper
│   ├── watcher.py          # Watchdog file monitor
│   ├── file_reader.py      # Multi-format text extraction
│   ├── clustering.py       # Agglomerative clustering + UMAP
│   ├── cluster_namer.py    # LLM cluster naming
│   ├── rag.py              # RAG chat pipeline
│   ├── websocket.py        # WebSocket event broadcast
│   ├── file_organizer.py   # Semantic file organization
│   ├── basic_organizer.py  # Extension-based organization
│   └── routers/            # API route modules
└── frontend/
    └── src/
        ├── App.tsx          # Root component + state
        ├── api.ts           # Typed API wrappers
        ├── types.ts         # Shared interfaces
        └── components/
            ├── ForceGraph.tsx      # D3 force-directed graph
            ├── SpatialView.tsx     # Voronoi spatial view
            ├── TimelineView.tsx    # Activity timeline feed
            ├── ChatPanel.tsx       # RAG chatbot
            ├── SearchModal.tsx     # Cmd+K search palette
            ├── GapAnalysisPanel.tsx # Knowledge gap detector
            └── ...
```

---

