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


async def organize_files(cluster_data: dict, target_root: Path | None = None) -> dict:
    """
    Move (or copy) files into cluster-named subdirectories, preserving
    top-level folder structure.

    If target_root is None, files are moved within SEFS_ROOT.
    If target_root is set (e.g. a -semantic replica folder), files are COPIED there.

    Structure (preserving top-level subfolders):
        root/
            cluster-name-a/          ← root-level files
                file_at_root.txt
            ProjectA/
                cluster-name-1/
                    file1.txt
                cluster-name-2/
                    file2.py
            ProjectB/
                cluster-name-3/
                    file3.md
            _unclustered/
                noise_file.txt

    Returns summary of moves performed.
    """
    use_copy = target_root is not None
    root = target_root or config.SEFS_ROOT
    source_root = config.SEFS_ROOT
    moves = []
    errors = []

    # Build a lookup: figure out which top-level subfolder each file belongs to
    # so we can place cluster folders inside the correct subfolder.
    def _get_container(file_path: Path) -> Path:
        """
        Determine the container directory for a file.
        - If the file is directly in source_root → container is root
        - If the file is under source_root/SubFolder/... → container is root/SubFolder
        """
        try:
            rel = file_path.relative_to(source_root)
        except ValueError:
            return root
        parts = rel.parts
        if len(parts) <= 1:
            # File is directly in source_root
            return root
        else:
            # File is under a top-level subfolder
            return root / parts[0]

    for cluster in cluster_data.get("clusters", []):
        label = cluster["label"]
        name = cluster["name"]

        # Determine folder name
        if label < 0:
            folder_name = "_unclustered"
        else:
            folder_name = name

        # Update cluster folder path in DB
        if label >= 0:
            await db.upsert_cluster(
                label=label,
                name=name,
                file_count=cluster["file_count"],
                folder_path=str(root / folder_name),
            )

        for file_info in cluster["files"]:
            src = Path(file_info["path"])

            # Skip if source doesn't exist
            if not src.exists():
                logger.warning(f"Source file not found: {src}")
                continue

            # Determine the container (root or root/SubFolder)
            container = _get_container(src)
            target_dir = container / folder_name
            target_dir.mkdir(parents=True, exist_ok=True)

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
                if use_copy:
                    shutil.copy2(str(src), str(dest))
                    logger.info(f"Copied: {src} -> {dest}")
                else:
                    shutil.move(str(src), str(dest))
                    logger.info(f"Moved: {src} -> {dest}")

                # Update file path in-place (only when moving, not copying)
                if not use_copy:
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
    if not use_copy:
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
