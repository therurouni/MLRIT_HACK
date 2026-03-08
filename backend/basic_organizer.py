"""
SEFS Basic Organizer — Categorize files by extension type into folders.

Categories:
    Images/      — .png, .jpg, .jpeg, .gif, .bmp, .tiff, .tif, .webp, .svg, .ico
    Documents/   — .pdf, .docx, .doc, .pptx, .ppt, .xlsx, .xls, .odt, .ods, .odp, .rtf, .tex
    Videos/      — .mp4, .mkv, .avi, .mov, .wmv, .flv, .webm, .m4v
    Audio/       — .mp3, .wav, .flac, .aac, .ogg, .wma, .m4a, .opus
    Archives/    — .zip, .tar, .gz, .bz2, .7z, .rar, .xz, .zst
    Code/        — common source-code extensions
    Data/        — .csv, .tsv, .json, .jsonl, .xml, .yaml, .yml, .toml, .sql, .parquet
    Text/        — .txt, .md, .markdown, .rst, .log, .org
    Other/       — anything that doesn't match
"""

import logging
import shutil
from pathlib import Path
from typing import Dict, List, Set

from backend.config import IGNORE_PATTERNS
from backend.websocket import ws_manager
from backend import database as db

logger = logging.getLogger("sefs.basic_organizer")

# ─── Extension → Category mapping ────────────────────────────────────────────

CATEGORY_MAP: Dict[str, Set[str]] = {
    "Images": {
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif",
        ".webp", ".svg", ".ico", ".heic", ".heif", ".raw", ".cr2", ".nef",
    },
    "Documents": {
        ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
        ".odt", ".ods", ".odp", ".rtf", ".tex", ".bib", ".epub",
    },
    "Videos": {
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm",
        ".m4v", ".mpg", ".mpeg", ".3gp",
    },
    "Audio": {
        ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a",
        ".opus", ".mid", ".midi",
    },
    "Archives": {
        ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".xz",
        ".zst", ".tgz", ".tbz2",
    },
    "Code": {
        ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h",
        ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt",
        ".scala", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
        ".lua", ".pl", ".pm", ".ex", ".exs", ".erl", ".hrl",
        ".hs", ".lhs", ".ml", ".mli", ".clj", ".cljs", ".cljc",
        ".dart", ".v", ".sv", ".vhd", ".vhdl", ".zig", ".nim",
        ".jl", ".f90", ".f95", ".f03", ".for", ".fpp",
        ".r", ".m",
        ".html", ".htm", ".css", ".scss", ".sass", ".less",
        ".vue", ".svelte", ".astro",
        ".dockerfile", ".makefile", ".cmake",
        ".proto", ".graphql", ".gql", ".tf", ".hcl",
        ".gradle", ".sbt",
    },
    "Data": {
        ".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml",
        ".toml", ".sql", ".parquet", ".avro", ".ini", ".cfg", ".conf",
    },
    "Text": {
        ".txt", ".md", ".markdown", ".rst", ".log", ".org", ".env",
    },
}

# Build reverse lookup: extension → category
_EXT_TO_CATEGORY: Dict[str, str] = {}
for _cat, _exts in CATEGORY_MAP.items():
    for _ext in _exts:
        _EXT_TO_CATEGORY[_ext] = _cat


def get_category(extension: str) -> str:
    """Get the category for a file extension."""
    return _EXT_TO_CATEGORY.get(extension.lower(), "Other")


def should_ignore_path(path: Path) -> bool:
    """Check if a path should be ignored during organization."""
    parts = path.parts
    for pattern in IGNORE_PATTERNS:
        if pattern in parts:
            return True
    if path.name.startswith("."):
        return True
    return False


def _is_category_folder(name: str) -> bool:
    """Check if a directory name is one of our category folders."""
    return name in CATEGORY_MAP or name == "Other"


def _collect_all_files(directory: Path) -> List[Path]:
    """
    Recursively collect all files under `directory`, skipping ignored paths
    and existing category folders.
    """
    import os
    files = []
    for dirpath, dirnames, filenames in os.walk(directory):
        # Filter out ignored and category directories
        dirnames[:] = [
            d for d in dirnames
            if d not in IGNORE_PATTERNS
            and not d.startswith(".")
            and not _is_category_folder(d)
        ]
        for filename in filenames:
            filepath = Path(dirpath) / filename
            if not should_ignore_path(filepath) and filepath.is_file():
                files.append(filepath)
    return files


def _move_file_to_category(
    filepath: Path, container: Path
) -> tuple[Path, str] | None:
    """
    Move a file into the appropriate category subfolder within `container`.
    Returns (dest_path, category) or None if already in place.
    """
    ext = filepath.suffix.lower()
    category = get_category(ext)
    target_dir = container / category
    target_dir.mkdir(parents=True, exist_ok=True)

    # Skip if already in the correct category folder
    if filepath.parent == target_dir:
        return None

    # Handle name collisions
    dest = target_dir / filepath.name
    if dest.exists() and dest != filepath:
        stem = filepath.stem
        suffix = filepath.suffix
        counter = 1
        while dest.exists():
            dest = target_dir / f"{stem}_{counter}{suffix}"
            counter += 1

    shutil.move(str(filepath), str(dest))
    return dest, category


async def basic_organize(root: Path) -> dict:
    """
    Organize files by extension type, preserving top-level folder structure.

    Logic:
    - Root-level files → root/Category/file
    - Each top-level subfolder is preserved. All files within it (including
      nested sub-subfolders) are flattened up and sorted into category folders
      inside that subfolder:
        ProjectA/deep/nested/code.py  →  ProjectA/Code/code.py
    - Empty original sub-subfolders are cleaned up afterward.

    Returns summary of moves performed.
    """
    import os

    moves: List[dict] = []
    errors: List[dict] = []
    category_counts: Dict[str, int] = {}

    logger.info(f"Starting basic organization of {root}")
    await ws_manager.broadcast("basic_organize_started", {"root": str(root)})

    # ── 1. Identify top-level entries ─────────────────────────────────────
    top_level_files: List[Path] = []
    top_level_dirs: List[Path] = []

    for entry in sorted(root.iterdir()):
        if entry.name in IGNORE_PATTERNS or entry.name.startswith("."):
            continue
        if _is_category_folder(entry.name):
            continue  # skip existing category folders from prior runs
        if entry.is_file():
            top_level_files.append(entry)
        elif entry.is_dir():
            top_level_dirs.append(entry)

    # ── 2. Organize root-level files into root/Category/ ─────────────────
    for filepath in top_level_files:
        try:
            result = _move_file_to_category(filepath, root)
            if result:
                dest, category = result
                await db.update_file_path(
                    old_path=str(filepath),
                    new_path=str(dest),
                    new_filename=dest.name,
                )
                moves.append({
                    "from": str(filepath),
                    "to": str(dest),
                    "category": category,
                })
                category_counts[category] = category_counts.get(category, 0) + 1
        except Exception as e:
            logger.error(f"Failed to move {filepath}: {e}")
            errors.append({"file": str(filepath), "error": str(e)})

    # ── 3. For each top-level subfolder: flatten + categorize within it ───
    for subdir in top_level_dirs:
        # Collect ALL files recursively from this subfolder
        all_files = _collect_all_files(subdir)

        for filepath in all_files:
            try:
                result = _move_file_to_category(filepath, subdir)
                if result:
                    dest, category = result
                    await db.update_file_path(
                        old_path=str(filepath),
                        new_path=str(dest),
                        new_filename=dest.name,
                    )
                    moves.append({
                        "from": str(filepath),
                        "to": str(dest),
                        "category": category,
                        "subfolder": subdir.name,
                    })
                    category_counts[category] = category_counts.get(category, 0) + 1
            except Exception as e:
                logger.error(f"Failed to move {filepath}: {e}")
                errors.append({"file": str(filepath), "error": str(e)})

        # Clean up empty sub-subfolders within this top-level dir
        _cleanup_empty_dirs(subdir)

    summary = {
        "moves": len(moves),
        "errors": len(errors),
        "categories": category_counts,
        "details": moves,
        "error_details": errors,
    }

    logger.info(
        f"Basic organization complete: {len(moves)} files moved into "
        f"{len(category_counts)} categories, {len(errors)} errors"
    )
    await db.log_event("basic_organize_complete", {
        "moves": len(moves),
        "errors": len(errors),
        "categories": category_counts,
    })
    await ws_manager.broadcast("basic_organize_complete", summary)

    return summary


def _cleanup_empty_dirs(root: Path) -> None:
    """Remove empty directories under root (but not root itself)."""
    for dirpath in sorted(root.rglob("*"), reverse=True):
        if dirpath.is_dir() and dirpath != root:
            try:
                if not any(dirpath.iterdir()):
                    dirpath.rmdir()
                    logger.debug(f"Removed empty dir: {dirpath}")
            except OSError:
                pass
