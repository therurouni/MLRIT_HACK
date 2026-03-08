"""
SEFS Watcher — Watchdog-based folder watcher for new/modified/deleted files.
Reads file content, embeds it, and triggers clustering.
"""

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent, FileDeletedEvent

import backend.config as config
from backend.config import ALL_SUPPORTED_EXTENSIONS, IGNORE_PATTERNS, MAX_FILE_SIZE_BYTES
from backend import database as db
from backend.embeddings import embed_text
from backend.vector_store import vector_store
from backend.websocket import ws_manager
from backend.file_reader import read_file_content

logger = logging.getLogger("sefs.watcher")

# Global observer
_observer: Optional[Observer] = None
_loop: Optional[asyncio.AbstractEventLoop] = None


def should_ignore(path: Path) -> bool:
    """Check if a path should be ignored."""
    parts = path.parts
    for pattern in IGNORE_PATTERNS:
        if pattern in parts:
            return True
    if path.name.startswith("."):
        return True
    return False


def is_supported_file(path: Path) -> bool:
    """Check if a file is a supported format we can embed."""
    # Check extension against all supported types
    if path.suffix.lower() in ALL_SUPPORTED_EXTENSIONS:
        return True
    # No extension — try to detect as text
    if not path.suffix:
        return True
    return False


def compute_hash(content: str) -> str:
    """Compute a content hash for deduplication."""
    return hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()[:16]


async def process_file(path: Path) -> Optional[int]:
    """
    Process a single file: read, hash, embed, store.
    Returns the file ID if successful.
    """
    if should_ignore(path) or not path.is_file():
        return None

    if not is_supported_file(path):
        logger.debug(f"Skipping unsupported file: {path}")
        return None

    content = read_file_content(path)
    if content is None:
        return None

    content_hash = compute_hash(content)
    content_preview = content[:500] if content else ""

    # Check if already embedded with same hash
    existing = await db.get_file_by_path(str(path))
    if existing and existing.get("content_hash") == content_hash and existing.get("faiss_id") is not None:
        logger.debug(f"File unchanged, skipping: {path}")
        return existing["id"]

    # Upsert file metadata
    file_id = await db.upsert_file(
        path=str(path),
        filename=path.name,
        extension=path.suffix.lower(),
        size_bytes=path.stat().st_size,
        content_hash=content_hash,
        content_preview=content_preview,
    )

    # Embed the content
    if content.strip():
        try:
            embedding = await embed_text(content)
            faiss_id = vector_store.add(embedding)
            await db.update_file_embedding(file_id, faiss_id)
            vector_store.save()
            logger.info(f"Embedded: {path.name} (file_id={file_id}, faiss_id={faiss_id})")
        except Exception as e:
            logger.error(f"Embedding failed for {path}: {e}")
    else:
        logger.debug(f"Empty content, skipping embedding: {path}")

    # Log event and broadcast
    await db.log_event("file_processed", {"file_id": file_id, "path": str(path), "filename": path.name})
    await ws_manager.broadcast("file_processed", {"file_id": file_id, "path": str(path), "filename": path.name})

    return file_id


async def process_deleted_file(path: Path) -> None:
    """Handle file deletion."""
    faiss_id = await db.delete_file_by_path(str(path))
    logger.info(f"Deleted file record: {path} (faiss_id={faiss_id})")
    await db.log_event("file_deleted", {"path": str(path)})
    await ws_manager.broadcast("file_deleted", {"path": str(path)})


async def scan_directory(root: Path | None = None) -> list[int]:
    """
    Full scan of the root directory. Process all text files.
    Returns list of file IDs.
    """
    root = root or config.SEFS_ROOT
    file_ids = []

    logger.info(f"Starting full scan of {root}")
    await db.log_event("scan_started", {"root": str(root)})
    await ws_manager.broadcast("scan_started", {"root": str(root)})

    for dirpath, dirnames, filenames in os.walk(root):
        # Filter out ignored directories in-place
        dirnames[:] = [d for d in dirnames if d not in IGNORE_PATTERNS and not d.startswith(".")]

        for filename in filenames:
            filepath = Path(dirpath) / filename
            file_id = await process_file(filepath)
            if file_id is not None:
                file_ids.append(file_id)

    # Prune stale DB entries: remove records whose files no longer exist on disk
    all_db_files = await db.get_all_files()
    pruned = 0
    for f in all_db_files:
        if not Path(f["path"]).exists():
            await db.delete_file_by_path(f["path"])
            logger.info(f"Pruned stale record: {f['path']}")
            pruned += 1
    if pruned:
        logger.info(f"Pruned {pruned} stale file records from DB")

    logger.info(f"Scan complete. Processed {len(file_ids)} files.")
    await db.log_event("scan_complete", {"file_count": len(file_ids)})
    await ws_manager.broadcast("scan_complete", {"file_count": len(file_ids)})

    return file_ids


class SEFSEventHandler(FileSystemEventHandler):
    """Watchdog event handler that bridges sync callbacks to async processing."""

    def __init__(self):
        super().__init__()
        self._pending: dict[str, asyncio.Handle] = {}

    def _run_async(self, coro):
        """Schedule an async coroutine from the sync watchdog thread."""
        if _loop and _loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, _loop)

    def _debounced_process(self, path: Path, coro_factory, delay: float = 1.0):
        """Schedule file processing with debounce to coalesce duplicate events."""
        key = str(path)
        if _loop and _loop.is_running():
            # Cancel any previously scheduled task for this path
            existing = self._pending.pop(key, None)
            if existing:
                existing.cancel()

            def _schedule():
                handle = _loop.call_later(delay, self._fire, key, coro_factory)
                self._pending[key] = handle

            _loop.call_soon_threadsafe(_schedule)

    def _fire(self, key: str, coro_factory):
        """Actually run the coroutine after debounce delay."""
        self._pending.pop(key, None)
        asyncio.ensure_future(coro_factory())

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if not should_ignore(path):
            logger.info(f"File created: {path}")
            self._debounced_process(path, lambda: process_file(path))

    def on_modified(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if not should_ignore(path):
            logger.debug(f"File modified: {path}")
            self._debounced_process(path, lambda: process_file(path))

    def on_deleted(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if not should_ignore(path):
            logger.info(f"File deleted: {path}")
            self._run_async(process_deleted_file(path))


def start_watcher(root: Path | None = None, loop: asyncio.AbstractEventLoop | None = None) -> Observer:
    """Start the file watcher on the root directory."""
    global _observer, _loop
    _loop = loop

    root = root or config.SEFS_ROOT
    root.mkdir(parents=True, exist_ok=True)

    handler = SEFSEventHandler()
    _observer = Observer()
    _observer.schedule(handler, str(root), recursive=True)
    _observer.daemon = True
    _observer.start()

    logger.info(f"File watcher started on {root}")
    return _observer


def stop_watcher() -> None:
    """Stop the file watcher."""
    global _observer
    if _observer:
        _observer.stop()
        _observer.join(timeout=5)
        _observer = None
        logger.info("File watcher stopped")
