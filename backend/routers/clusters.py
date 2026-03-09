"""
SEFS Clusters Router — clustering, graph data, UMAP projections, and file organization.
"""

import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend import database as db
from backend.clustering import cluster_files
from backend.cluster_namer import name_all_clusters
from backend.file_organizer import organize_files, _cleanup_empty_dirs
from backend.websocket import ws_manager
import backend.config as config

logger = logging.getLogger("sefs.routers.clusters")
router = APIRouter(prefix="/api/clusters", tags=["clusters"])

# Cache the latest clustering result in memory
_latest_cluster_data: Optional[dict] = None


class ReclusterRequest(BaseModel):
    organize: bool = False  # Whether to physically move files after clustering
    semantic_organize: bool = False  # If true, organize into a -semantic replica folder


class MoveNodeRequest(BaseModel):
    file_id: int
    target_cluster_label: int  # The cluster label to move the file into


@router.get("")
async def list_clusters():
    """List all clusters."""
    clusters = await db.get_all_clusters()
    return {"clusters": clusters, "total": len(clusters)}


@router.post("/recluster")
async def recluster(req: ReclusterRequest, background_tasks: BackgroundTasks):
    """Trigger re-clustering of all embedded files."""
    # Check scan flags if not explicitly set
    from backend.routers.files import _scan_flags
    semantic = req.semantic_organize or _scan_flags.get("semantic_organize", False)
    background_tasks.add_task(_run_clustering, req.organize, semantic)
    return {"status": "clustering_started", "organize": req.organize, "semantic_organize": semantic}


async def _run_clustering(organize: bool = False, semantic_organize: bool = False):
    """Background clustering task."""
    global _latest_cluster_data
    try:
        await ws_manager.broadcast("clustering_started", {})

        # Step 1: Cluster
        cluster_data = await cluster_files()
        await ws_manager.broadcast("clustering_complete", {
            "total_clusters": cluster_data.get("total_clusters", 0),
            "total_files": cluster_data.get("total_files", 0),
        })

        # Step 2: Name clusters using LLM
        await ws_manager.broadcast("naming_started", {})
        cluster_data = await name_all_clusters(cluster_data)
        await ws_manager.broadcast("naming_complete", {
            "clusters": [{"label": c["label"], "name": c["name"]} for c in cluster_data.get("clusters", [])],
        })

        _latest_cluster_data = cluster_data

        # Step 3: Optionally organize files on disk
        if organize or semantic_organize:
            import backend.config as config

            if semantic_organize:
                # Create a replica folder: originalname-semantic
                original_root = config.SEFS_ROOT
                semantic_root = original_root.parent / f"{original_root.name}-semantic"
                semantic_root.mkdir(parents=True, exist_ok=True)
                target_root = semantic_root
                logger.info(f"Semantic organize: replica folder at {semantic_root}")
            else:
                target_root = None  # Use original root

            await ws_manager.broadcast("organizing_started", {
                "semantic": semantic_organize,
                "target_root": str(target_root) if target_root else None,
            })
            summary = await organize_files(cluster_data, target_root=target_root)
            await ws_manager.broadcast("organizing_complete", summary)

    except Exception as e:
        logger.error(f"Clustering pipeline failed: {e}", exc_info=True)
        await ws_manager.broadcast("clustering_error", {"error": str(e)})


@router.get("/graph")
async def get_graph():
    """
    Get force-directed graph data.
    Returns nodes (files) and links (connections between files in same cluster).
    """
    files = await db.get_all_files()
    clusters = await db.get_all_clusters()

    # Build nodes
    nodes = []
    for f in files:
        nodes.append({
            "id": f["id"],
            "label": f["filename"],
            "cluster_id": f.get("cluster_id", -1),
            "cluster_name": f.get("cluster_name", "Unclustered"),
        })

    # Build links: connect files within the same cluster
    links = []
    cluster_groups = {}
    for f in files:
        cid = f.get("cluster_id")
        if cid is not None and cid >= 0:
            if cid not in cluster_groups:
                cluster_groups[cid] = []
            cluster_groups[cid].append(f["id"])

    for cid, file_ids in cluster_groups.items():
        # Connect each file to every other file in the cluster (star topology from first)
        if len(file_ids) > 1:
            hub = file_ids[0]
            for fid in file_ids[1:]:
                links.append({"source": hub, "target": fid, "cluster_id": cid})

    return {
        "nodes": nodes,
        "links": links,
        "clusters": [{"id": c["id"], "label": c["label"], "name": c["name"]} for c in clusters],
    }


@router.get("/umap")
async def get_umap():
    """Get UMAP 2D projection data for all embedded files."""
    global _latest_cluster_data
    if not _latest_cluster_data or not _latest_cluster_data.get("umap"):
        return {"points": []}

    # Enrich UMAP points with latest cluster names from DB
    files = await db.get_all_files()
    file_map = {f["id"]: f for f in files}

    enriched = []
    for pt in _latest_cluster_data["umap"]:
        f = file_map.get(pt["file_id"])
        enriched.append({
            **pt,
            "cluster_name": f["cluster_name"] if f and f.get("cluster_name") else f"Cluster {pt['cluster_label']}",
        })

    return {"points": enriched}


@router.get("/timeline")
async def get_timeline(limit: int = 500):
    """
    Get a unified chronological log of all activity:
    file creations/updates, system events, and cluster creations.
    """
    entries: list[dict] = []

    # 1. File events — each file tracked = a "file_added" entry
    files = await db.get_timeline_files()
    for f in files:
        entries.append({
            "kind": "file_added",
            "timestamp": f["created_at"],
            "file_id": f["id"],
            "filename": f["filename"],
            "extension": f.get("extension", ""),
            "cluster_id": f.get("cluster_id") if f.get("cluster_id") is not None else -1,
            "cluster_name": f.get("cluster_name") or "Unclustered",
        })
        # If updated_at differs meaningfully from created_at, add update entry
        if f["updated_at"] and f["created_at"] and (f["updated_at"] - f["created_at"]) > 2:
            entries.append({
                "kind": "file_updated",
                "timestamp": f["updated_at"],
                "file_id": f["id"],
                "filename": f["filename"],
                "extension": f.get("extension", ""),
                "cluster_id": f.get("cluster_id") if f.get("cluster_id") is not None else -1,
                "cluster_name": f.get("cluster_name") or "Unclustered",
            })

    # 2. Cluster creations
    clusters = await db.get_all_clusters()
    for c in clusters:
        entries.append({
            "kind": "cluster_created",
            "timestamp": c["created_at"],
            "cluster_id": c["label"],
            "cluster_name": c.get("name") or f"Cluster {c['label']}",
            "file_count": c.get("file_count", 0),
        })

    # 3. System events (scan, clustering, naming, organizing, etc.)
    events = await db.get_recent_events(limit=200)
    for ev in events:
        entries.append({
            "kind": "event",
            "timestamp": ev["created_at"],
            "event_type": ev["event_type"],
            "data": ev.get("data") or {},
        })

    # Sort all entries chronologically (newest first)
    entries.sort(key=lambda e: e["timestamp"], reverse=True)

    return {"entries": entries[:limit]}


@router.post("/organize")
async def organize(background_tasks: BackgroundTasks):
    """Physically organize files into cluster folders (uses last clustering result)."""
    global _latest_cluster_data
    if not _latest_cluster_data:
        return {"status": "error", "message": "No clustering data. Run /recluster first."}

    background_tasks.add_task(organize_files, _latest_cluster_data)
    return {"status": "organizing_started"}


@router.post("/move-node")
async def move_node(req: MoveNodeRequest):
    """
    Move a file (node) from its current cluster to a different cluster.
    - Updates DB cluster assignment
    - Moves the actual file on disk (in sefs-root-semantic folder if it exists)
    - If the source cluster becomes empty, removes it from DB and deletes its folder
    """
    # 1. Get the file
    file_record = await db.get_file_by_id(req.file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    old_cluster_id = file_record.get("cluster_id")

    # 2. Get the target cluster
    target_cluster = await db.get_cluster_by_label(req.target_cluster_label)
    if not target_cluster:
        raise HTTPException(status_code=404, detail="Target cluster not found")

    # Don't move if already in the target cluster
    if old_cluster_id == req.target_cluster_label:
        return {"status": "no_change", "message": "File is already in the target cluster"}

    target_cluster_name = target_cluster["name"]

    # 3. Update DB: file cluster assignment
    await db.update_file_cluster(req.file_id, req.target_cluster_label, target_cluster_name)

    # 4. Move the actual file on disk
    src_path = Path(file_record["path"])
    moved_on_disk = False

    if src_path.exists():
        # Determine the target folder from the target cluster's folder_path
        # or construct it from the semantic root
        target_folder = None

        if target_cluster.get("folder_path"):
            target_folder = Path(target_cluster["folder_path"])
        else:
            # Try sefs-root-semantic folder
            semantic_root = config.SEFS_ROOT.parent / f"{config.SEFS_ROOT.name}-semantic"
            if semantic_root.exists():
                target_folder = semantic_root / target_cluster_name
            else:
                # Use main sefs root
                target_folder = config.SEFS_ROOT / target_cluster_name

        if target_folder:
            target_folder.mkdir(parents=True, exist_ok=True)
            dest = target_folder / src_path.name

            # Handle name collisions
            if dest.exists() and dest != src_path:
                stem = src_path.stem
                suffix = src_path.suffix
                counter = 1
                while dest.exists():
                    dest = target_folder / f"{stem}_{counter}{suffix}"
                    counter += 1

            try:
                shutil.move(str(src_path), str(dest))
                await db.update_file_path(
                    old_path=str(src_path),
                    new_path=str(dest),
                    new_filename=dest.name,
                )
                moved_on_disk = True
                logger.info(f"Moved file on disk: {src_path} -> {dest}")
            except Exception as e:
                logger.error(f"Failed to move file on disk: {e}")
                # DB is already updated, log the error but continue

    # 5. Update target cluster file count
    target_files = await db.get_files_by_cluster(req.target_cluster_label)
    await db.update_cluster_file_count(req.target_cluster_label, len(target_files))

    # 6. Handle source cluster: check if it's now empty
    source_cluster_removed = False
    if old_cluster_id is not None and old_cluster_id >= 0:
        source_files = await db.get_files_by_cluster(old_cluster_id)
        if len(source_files) == 0:
            # Cluster is empty — remove it
            source_cluster = await db.get_cluster_by_label(old_cluster_id)
            if source_cluster:
                # Delete the empty cluster folder on disk
                if source_cluster.get("folder_path"):
                    folder = Path(source_cluster["folder_path"])
                    if folder.exists() and folder.is_dir():
                        try:
                            # Only remove if truly empty
                            remaining = list(folder.iterdir())
                            if not remaining:
                                folder.rmdir()
                                logger.info(f"Removed empty cluster folder: {folder}")
                        except OSError as e:
                            logger.warning(f"Could not remove cluster folder {folder}: {e}")

                await db.delete_cluster(old_cluster_id)
                source_cluster_removed = True
                logger.info(f"Removed empty cluster: label={old_cluster_id}")
        else:
            # Update file count for the source cluster
            await db.update_cluster_file_count(old_cluster_id, len(source_files))

    # 7. Clean up any empty directories in both roots
    _cleanup_empty_dirs(config.SEFS_ROOT)
    semantic_root = config.SEFS_ROOT.parent / f"{config.SEFS_ROOT.name}-semantic"
    if semantic_root.exists():
        _cleanup_empty_dirs(semantic_root)

    # 8. Log event and broadcast
    await db.log_event("node_moved", {
        "file_id": req.file_id,
        "filename": file_record["filename"],
        "from_cluster": old_cluster_id,
        "to_cluster": req.target_cluster_label,
        "to_cluster_name": target_cluster_name,
        "source_cluster_removed": source_cluster_removed,
    })
    await ws_manager.broadcast("node_moved", {
        "file_id": req.file_id,
        "filename": file_record["filename"],
        "from_cluster": old_cluster_id,
        "to_cluster": req.target_cluster_label,
        "to_cluster_name": target_cluster_name,
        "source_cluster_removed": source_cluster_removed,
        "moved_on_disk": moved_on_disk,
    })

    return {
        "status": "success",
        "file_id": req.file_id,
        "filename": file_record["filename"],
        "from_cluster": old_cluster_id,
        "to_cluster": req.target_cluster_label,
        "to_cluster_name": target_cluster_name,
        "source_cluster_removed": source_cluster_removed,
        "moved_on_disk": moved_on_disk,
    }


@router.get("/gap-analysis")
async def gap_analysis():
    """
    Analyse which knowledge topics are absent from the current file corpus.
    Returns existing cluster topics and AI-detected gaps.
    """
    import httpx as _httpx
    from backend.config import OLLAMA_BASE_URL, LLM_MODEL

    clusters = await db.get_all_clusters()
    if not clusters:
        return {"existing": [], "gaps": [], "summary": "No clusters found. Run a scan and cluster first."}

    existing = [
        {"name": c["name"], "file_count": c.get("file_count", 0)}
        for c in clusters
        if c.get("name")
    ]

    cluster_list = "\n".join(
        f'- {e["name"]} ({e["file_count"]} files)' for e in existing
    )

    prompt = f"""You are a learning advisor analyzing someone's personal knowledge base.

Their files are organized into these topic clusters:
{cluster_list}

Your task: identify IMPORTANT knowledge gaps — meaningful topics that are clearly absent.

Rules:
- Only suggest gaps that are directly related to the topics present
- Each gap must be a specific, actionable topic (not vague like "more files")
- Provide exactly 5-7 gaps
- For each gap, write one sentence explaining why it matters given what they have

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "gaps": [
    {{"topic": "short-topic-name", "reason": "One sentence explanation."}},
    {{"topic": "another-topic", "reason": "One sentence explanation."}}
  ],
  "summary": "One sentence overall assessment of the knowledge base."
}}"""

    try:
        async with _httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=_httpx.Timeout(120.0, connect=10.0),
        ) as client:
            response = await client.post(
                "/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.4, "num_predict": 600},
                },
            )
            response.raise_for_status()
            raw = response.json().get("response", "").strip()

        # Extract JSON from the response (model may wrap it)
        import re as _re, json as _json
        match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if match:
            parsed = _json.loads(match.group())
        else:
            parsed = {"gaps": [], "summary": raw}

        return {
            "existing": existing,
            "gaps": parsed.get("gaps", []),
            "summary": parsed.get("summary", ""),
        }

    except Exception as e:
        logger.error(f"Gap analysis failed: {e}", exc_info=True)
        return {
            "existing": existing,
            "gaps": [],
            "summary": f"Analysis failed: {e}",
        }
