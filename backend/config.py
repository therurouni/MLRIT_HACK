"""
SEFS Configuration — all settings, paths, model names, and tunables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (next to pyproject.toml)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# ─── Paths ────────────────────────────────────────────────────────────────────
# Project root (directory containing pyproject.toml)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Root folder the user wants to organize (resolved relative to project root)
_raw_root = os.environ.get("SEFS_ROOT", "")
if not _raw_root:
    SEFS_ROOT = Path.home() / "sefs-root"
elif Path(_raw_root).is_absolute():
    SEFS_ROOT = Path(_raw_root)
else:
    SEFS_ROOT = (_PROJECT_ROOT / _raw_root).resolve()

# Internal data directory (FAISS index, SQLite DB)
DATA_DIR = Path(os.environ.get("SEFS_DATA_DIR", SEFS_ROOT / ".sefs-data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

FAISS_INDEX_PATH = DATA_DIR / "embeddings.faiss"
SQLITE_DB_PATH = DATA_DIR / "sefs.db"

# ─── Ollama ───────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("SEFS_EMBED_MODEL", "nomic-embed-text:latest")
LLM_MODEL = os.environ.get("SEFS_LLM_MODEL", "llama3.2:latest")
EMBED_DIMENSION = 768  # nomic-embed-text output dimension

# ─── Clustering ───────────────────────────────────────────────────────────────
HDBSCAN_MIN_CLUSTER_SIZE = 2
HDBSCAN_MIN_SAMPLES = 1

# Agglomerative clustering: cosine distance threshold.
# Lower = stricter (more clusters), higher = looser (fewer clusters).
# Range: 0.0 (identical only) to 2.0 (everything merges).
# 0.3 means files must have cosine similarity >= 0.85 to cluster together.
COSINE_DISTANCE_THRESHOLD = float(os.environ.get("SEFS_CLUSTER_THRESHOLD", "0.3"))

# ─── Server ───────────────────────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 8484
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ─── File reading ─────────────────────────────────────────────────────────────
# Max file size to read/embed (5 MB)
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

# Extensions we treat as text and will embed
TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json", ".jsonl",
    ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h",
    ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala",
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
    ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".sql", ".r", ".m", ".tex", ".bib", ".log", ".org",
    ".dockerfile", ".makefile", ".cmake",
    # Additional programming languages
    ".lua", ".pl", ".pm", ".ex", ".exs", ".erl", ".hrl",
    ".hs", ".lhs", ".ml", ".mli", ".clj", ".cljs", ".cljc",
    ".dart", ".v", ".sv", ".vhd", ".vhdl", ".zig", ".nim",
    ".jl", ".f90", ".f95", ".f03", ".for", ".fpp",
    ".proto", ".graphql", ".gql", ".tf", ".hcl",
    ".gradle", ".sbt", ".pom",
    ".vue", ".svelte", ".astro",
}

# Binary format extensions (handled by file_reader.py)
BINARY_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".xlsx", ".xls",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".webp",
}

# All supported extensions
ALL_SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | BINARY_EXTENSIONS

# Files/folders to always ignore
IGNORE_PATTERNS = {
    ".sefs-data",
    ".git",
    ".DS_Store",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
}
