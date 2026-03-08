#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[SEFS]${NC} $*"; }
warn()  { echo -e "${YELLOW}[SEFS]${NC} $*"; }
error() { echo -e "${RED}[SEFS]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. Check Ollama ─────────────────────────────────────────────────────────
info "Checking Ollama..."
if ! command -v ollama &>/dev/null; then
    error "Ollama not found. Install from https://ollama.com"
fi

if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
    warn "Ollama not running — starting it..."
    ollama serve &>/dev/null &
    sleep 3
    if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
        error "Failed to start Ollama. Start it manually: ollama serve"
    fi
fi
info "Ollama is running."

# ─── 2. Pull models if missing ───────────────────────────────────────────────
pull_model() {
    local model="$1"
    if ollama list | grep -q "$model"; then
        info "Model $model already available."
    else
        info "Pulling $model (this may take a few minutes)..."
        ollama pull "$model"
    fi
}

pull_model "nomic-embed-text:latest"
pull_model "llama3.2:latest"

# ─── 3. Python environment ───────────────────────────────────────────────────
info "Setting up Python environment..."

if ! command -v uv &>/dev/null; then
    error "uv not found. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    info "Creating virtual environment with Python 3.11..."
    uv venv --python 3.11 .venv
fi

# Activate
source .venv/bin/activate

# Step 1: Install build deps FIRST (Cython + numpy must precede hdbscan/umap)
info "Installing build dependencies (Cython + numpy)..."
uv pip install "cython>=3.0" "numpy>=1.26.0,<2.0.0"

# Step 2: Install the project and all remaining deps
info "Installing SEFS and all dependencies..."
uv pip install -e .

info "Python environment ready."

# ─── 4. Create default watch folder ──────────────────────────────────────────
WATCH_DIR="${SEFS_ROOT:-$HOME/sefs-root}"
if [ ! -d "$WATCH_DIR" ]; then
    mkdir -p "$WATCH_DIR"
    info "Created watch folder: $WATCH_DIR"
else
    info "Watch folder exists: $WATCH_DIR"
fi

# ─── 5. Frontend setup ───────────────────────────────────────────────────────
info "Setting up frontend..."
cd frontend

if ! command -v node &>/dev/null; then
    error "Node.js not found. Install Node 18+."
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js 18+ required. Found: $(node -v)"
fi

if [ ! -d "node_modules" ]; then
    npm install
fi

# Start frontend in background
info "Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!
cd ..

# ─── 6. Start backend ────────────────────────────────────────────────────────
info "Starting backend on http://localhost:8484 ..."
info "Press Ctrl+C to stop both servers."

# Trap to kill frontend when backend stops
cleanup() {
    info "Shutting down..."
    kill $FRONTEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    info "Done."
}
trap cleanup EXIT INT TERM

# Run backend in foreground
cd backend
uvicorn main:app --host 0.0.0.0 --port 8484 --reload
