"""
SEFS Database — SQLite schema and async connection helpers via aiosqlite.
"""

import aiosqlite
import json
import time
from pathlib import Path
from typing import Any, Optional

import backend.config as config

# ─── Schema ───────────────────────────────────────────────────────────────────

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    path            TEXT NOT NULL UNIQUE,
    filename        TEXT NOT NULL,
    extension       TEXT,
    size_bytes      INTEGER,
    content_hash    TEXT,
    content_preview TEXT,
    faiss_id        INTEGER,
    cluster_id      INTEGER,
    cluster_name    TEXT,
    embedded_at     REAL,
    created_at      REAL NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at      REAL NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_faiss_id ON files(faiss_id);
CREATE INDEX IF NOT EXISTS idx_files_cluster_id ON files(cluster_id);

CREATE TABLE IF NOT EXISTS clusters (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    label           INTEGER NOT NULL UNIQUE,
    file_count      INTEGER DEFAULT 0,
    folder_path     TEXT,
    created_at      REAL NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at      REAL NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_clusters_label ON clusters(label);

CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type      TEXT NOT NULL,
    data            TEXT,
    created_at      REAL NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS chat_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    context_files   TEXT,
    created_at      REAL NOT NULL DEFAULT (strftime('%s', 'now'))
);
"""


# ─── Connection helper ────────────────────────────────────────────────────────

async def get_db() -> aiosqlite.Connection:
    """Get an aiosqlite connection with WAL mode and row factory."""
    db = await aiosqlite.connect(str(config.SQLITE_DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    """Initialize database schema."""
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    finally:
        await db.close()


# ─── File CRUD ────────────────────────────────────────────────────────────────

async def upsert_file(
    path: str,
    filename: str,
    extension: str,
    size_bytes: int,
    content_hash: str,
    content_preview: str,
) -> int:
    """Insert or update a file record. Returns the file ID."""
    db = await get_db()
    try:
        now = time.time()
        await db.execute(
            """
            INSERT INTO files (path, filename, extension, size_bytes, content_hash, content_preview, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                filename = excluded.filename,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                content_hash = excluded.content_hash,
                content_preview = excluded.content_preview,
                updated_at = ?
            """,
            (path, filename, extension, size_bytes, content_hash, content_preview, now, now, now),
        )
        await db.commit()
        cursor = await db.execute("SELECT id FROM files WHERE path = ?", (path,))
        row = await cursor.fetchone()
        return row[0]
    finally:
        await db.close()


async def update_file_embedding(file_id: int, faiss_id: int) -> None:
    """Update file with its FAISS index ID."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE files SET faiss_id = ?, embedded_at = ? WHERE id = ?",
            (faiss_id, time.time(), file_id),
        )
        await db.commit()
    finally:
        await db.close()


async def update_file_cluster(file_id: int, cluster_id: int, cluster_name: str) -> None:
    """Update file with cluster assignment."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE files SET cluster_id = ?, cluster_name = ?, updated_at = ? WHERE id = ?",
            (cluster_id, cluster_name, time.time(), file_id),
        )
        await db.commit()
    finally:
        await db.close()


async def get_all_files() -> list[dict]:
    """Get all file records."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM files ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_timeline_files() -> list[dict]:
    """Get lightweight file records for timeline visualization, ordered by created_at."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, extension, cluster_id, cluster_name, created_at, updated_at "
            "FROM files ORDER BY created_at ASC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_file_by_id(file_id: int) -> Optional[dict]:
    """Get a single file by ID."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM files WHERE id = ?", (file_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_file_by_path(path: str) -> Optional[dict]:
    """Get a single file by path."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM files WHERE path = ?", (path,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_embedded_files() -> list[dict]:
    """Get all files that have embeddings."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM files WHERE faiss_id IS NOT NULL ORDER BY faiss_id ASC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def delete_file_by_path(path: str) -> Optional[int]:
    """Delete a file record by path. Returns the faiss_id if it had one."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT faiss_id FROM files WHERE path = ?", (path,))
        row = await cursor.fetchone()
        faiss_id = row[0] if row else None
        await db.execute("DELETE FROM files WHERE path = ?", (path,))
        await db.commit()
        return faiss_id
    finally:
        await db.close()


async def update_file_path(old_path: str, new_path: str, new_filename: str) -> None:
    """Update a file record's path in-place, preserving all other fields."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE files SET path = ?, filename = ?, updated_at = ? WHERE path = ?",
            (new_path, new_filename, time.time(), old_path),
        )
        await db.commit()
    finally:
        await db.close()


# ─── Cluster CRUD ─────────────────────────────────────────────────────────────

async def upsert_cluster(label: int, name: str, file_count: int, folder_path: str = "") -> int:
    """Insert or update a cluster. Returns cluster ID."""
    db = await get_db()
    try:
        now = time.time()
        await db.execute(
            """
            INSERT INTO clusters (label, name, file_count, folder_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(label) DO UPDATE SET
                name = excluded.name,
                file_count = excluded.file_count,
                folder_path = excluded.folder_path,
                updated_at = ?
            """,
            (label, name, file_count, folder_path, now, now, now),
        )
        await db.commit()
        cursor = await db.execute("SELECT id FROM clusters WHERE label = ?", (label,))
        row = await cursor.fetchone()
        return row[0]
    finally:
        await db.close()


async def get_all_clusters() -> list[dict]:
    """Get all clusters."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clusters ORDER BY label ASC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_cluster_by_label(label: int) -> Optional[dict]:
    """Get a single cluster by its label."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clusters WHERE label = ?", (label,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_files_by_cluster(cluster_id: int) -> list[dict]:
    """Get all files belonging to a specific cluster."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM files WHERE cluster_id = ?", (cluster_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def delete_cluster(label: int) -> None:
    """Delete a cluster by label."""
    db = await get_db()
    try:
        await db.execute("DELETE FROM clusters WHERE label = ?", (label,))
        await db.commit()
    finally:
        await db.close()


async def update_cluster_file_count(label: int, file_count: int) -> None:
    """Update the file_count for a cluster."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE clusters SET file_count = ?, updated_at = ? WHERE label = ?",
            (file_count, time.time(), label),
        )
        await db.commit()
    finally:
        await db.close()


async def clear_clusters() -> None:
    """Clear all cluster assignments."""
    db = await get_db()
    try:
        await db.execute("DELETE FROM clusters")
        await db.execute("UPDATE files SET cluster_id = NULL, cluster_name = NULL")
        await db.commit()
    finally:
        await db.close()


# ─── Events ───────────────────────────────────────────────────────────────────

async def log_event(event_type: str, data: Any = None) -> None:
    """Log an event."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO events (event_type, data) VALUES (?, ?)",
            (event_type, json.dumps(data) if data else None),
        )
        await db.commit()
    finally:
        await db.close()


async def get_recent_events(limit: int = 50) -> list[dict]:
    """Get recent events."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM events ORDER BY created_at DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if d.get("data"):
                d["data"] = json.loads(d["data"])
            result.append(d)
        return result
    finally:
        await db.close()


# ─── Chat ─────────────────────────────────────────────────────────────────────

async def save_chat_message(role: str, content: str, context_files: list[str] | None = None) -> int:
    """Save a chat message. Returns the message ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO chat_history (role, content, context_files) VALUES (?, ?, ?)",
            (role, content, json.dumps(context_files) if context_files else None),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def keyword_search_files(query: str, k: int = 20) -> list[dict]:
    """
    Keyword search across filenames and content previews using SQLite LIKE.
    Returns files scored by keyword relevance.
    """
    db = await get_db()
    try:
        keywords = [kw.strip().lower() for kw in query.split() if kw.strip()]
        if not keywords:
            return []

        conditions = []
        params = []
        for kw in keywords:
            conditions.append(
                "(LOWER(filename) LIKE ? OR LOWER(COALESCE(content_preview, '')) LIKE ? OR LOWER(COALESCE(extension, '')) LIKE ?)"
            )
            params.extend([f"%{kw}%", f"%{kw}%", f"%{kw}%"])

        where_clause = " OR ".join(conditions)
        cursor = await db.execute(
            f"SELECT * FROM files WHERE {where_clause} LIMIT ?",
            (*params, k * 2),
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            file_dict = dict(row)
            score = 0.0
            fname_lower = (file_dict.get("filename") or "").lower()
            preview_lower = (file_dict.get("content_preview") or "").lower()
            for kw in keywords:
                if kw in fname_lower:
                    score += 0.4
                if kw in preview_lower:
                    count = preview_lower.count(kw)
                    score += min(0.3, 0.1 * count)
            file_dict["keyword_score"] = min(1.0, score / max(len(keywords) * 0.5, 1))
            results.append(file_dict)

        results.sort(key=lambda x: x["keyword_score"], reverse=True)
        return results[:k]
    finally:
        await db.close()


async def get_chat_history(limit: int = 50) -> list[dict]:
    """Get recent chat messages."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM chat_history ORDER BY created_at ASC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if d.get("context_files"):
                d["context_files"] = json.loads(d["context_files"])
            result.append(d)
        return result
    finally:
        await db.close()
