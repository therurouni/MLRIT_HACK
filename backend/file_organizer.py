"""
SEFS File Organizer — Physically moves files into named semantic cluster folders.
"""

import logging
import shutil
from pathlib import Path

import backend.config as config
from backend import database as db
from backend.websocket import ws_manager

logger = logging.getLogger("sefs.file_organizer")


async def organize_files(cluster_data: dict) -> dict:
    """
    Move files into cluster-named subdirectories within SEFS_ROOT.

    Structure:
        ~/sefs-root/
            cluster-name-1/
                file1.txt
                file2.py
            cluster-name-2/
                file3.md
            _unclustered/
                noise_file.txt

    Returns summary of moves performed.
    """
    moves = []
    errors = []

    for cluster in cluster_data.get("clusters", []):
        label = cluster["label"]
        name = cluster["name"]

        # Determine target folder
        if label < 0:
            folder_name = "_unclustered"
        else:
            folder_name = name

        target_dir = config.SEFS_ROOT / folder_name
        target_dir.mkdir(parents=True, exist_ok=True)

        # Update cluster folder path in DB
        if label >= 0:
            await db.upsert_cluster(
                label=label,
                name=name,
                file_count=cluster["file_count"],
                folder_path=str(target_dir),
            )

        for file_info in cluster["files"]:
            src = Path(file_info["path"])

            # Skip if source doesn't exist
            if not src.exists():
                logger.warning(f"Source file not found: {src}")
                continue

            # Skip if already in the target directory
            if src.parent == target_dir:
                logger.debug(f"File already in correct folder: {src.name}")
                continue

            # Handle name collisions
            dest = target_dir / src.name
            if dest.exists() and dest != src:
                stem = src.stem
                suffix = src.suffix
                counter = 1
                while dest.exists():
                    dest = target_dir / f"{stem}_{counter}{suffix}"
                    counter += 1

            try:
                shutil.move(str(src), str(dest))
                logger.info(f"Moved: {src} -> {dest}")

                # Update file path in-place (preserves faiss_id, cluster_id, etc.)
                await db.update_file_path(
                    old_path=str(src),
                    new_path=str(dest),
                    new_filename=dest.name,
                )

                moves.append({
                    "from": str(src),
                    "to": str(dest),
                    "cluster": name,
                })

            except Exception as e:
                logger.error(f"Failed to move {src} -> {dest}: {e}")
                errors.append({"file": str(src), "error": str(e)})

    # Clean up empty directories (but not the root)
    _cleanup_empty_dirs(config.SEFS_ROOT)

    summary = {
        "moves": len(moves),
        "errors": len(errors),
        "details": moves,
        "error_details": errors,
    }

    logger.info(f"Organization complete: {len(moves)} files moved, {len(errors)} errors")
    await db.log_event("files_organized", {"moves": len(moves), "errors": len(errors)})
    await ws_manager.broadcast("files_organized", summary)

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
