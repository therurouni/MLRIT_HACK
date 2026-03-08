"""
SEFS Clustering — Agglomerative clustering with cosine distance + UMAP 2D projection.

Why Agglomerative over alternatives:
- HDBSCAN: density-based, struggles with small datasets (< ~20 files), often marks
  everything as noise or lumps into one cluster.
- KMeans: forces a fixed k; groups unrelated files when k is too low.
- DBSCAN (min_samples=1): becomes single-linkage -> chaining effect merges unrelated
  topics if any intermediate file is vaguely similar to both.
- Agglomerative (average linkage, cosine): merges clusters only when the average
  pairwise cosine distance is below a threshold. No chaining, no forced k, handles
  singletons naturally. A file about astrophysics won't get chained to biology just
  because one word overlaps.
"""

import logging
import numpy as np
from typing import Optional

from backend.config import COSINE_DISTANCE_THRESHOLD
from backend.vector_store import vector_store
from backend import database as db

logger = logging.getLogger("sefs.clustering")


def run_agglomerative(embeddings: np.ndarray) -> np.ndarray:
    """
    Agglomerative clustering with cosine distance and average linkage.
    Auto-determines the number of clusters via distance_threshold.
    Every file ends up in a cluster (no noise label -1).
    """
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.preprocessing import normalize
    from sklearn.metrics.pairwise import cosine_distances

    n = embeddings.shape[0]

    if n < 2:
        return np.array([0])  # single file = cluster 0

    # L2-normalize so cosine_distance = 1 - cosine_similarity
    normed = normalize(embeddings, norm="l2")

    # Precompute full distance matrix (fine for < 10K files)
    dist_matrix = cosine_distances(normed)

    clusterer = AgglomerativeClustering(
        n_clusters=None,                       # auto-determine from threshold
        distance_threshold=COSINE_DISTANCE_THRESHOLD,
        metric="precomputed",
        linkage="average",                     # average pairwise distance between clusters
    )

    labels = clusterer.fit_predict(dist_matrix)

    n_clusters = len(set(labels))
    logger.info(
        f"Agglomerative: {n_clusters} clusters from {n} files "
        f"(threshold={COSINE_DISTANCE_THRESHOLD})"
    )
    return labels


def run_umap(embeddings: np.ndarray, n_components: int = 2) -> np.ndarray:
    """
    Run UMAP dimensionality reduction for visualization.
    Returns array of shape (n, n_components).
    n_neighbors is dynamically set to min(15, n_files - 1).
    """
    import umap

    n_files = embeddings.shape[0]

    if n_files < 2:
        logger.warning("Not enough files for UMAP (need >= 2)")
        return np.zeros((n_files, n_components), dtype=np.float32)

    # Dynamic n_neighbors: never exceed file count - 1, minimum 2
    n_neighbors = max(2, min(15, n_files - 1))

    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )

    projected = reducer.fit_transform(embeddings)
    logger.info(f"UMAP: projected {n_files} files to {n_components}D (n_neighbors={n_neighbors})")

    return projected.astype(np.float32)


async def cluster_files() -> dict:
    """
    Full clustering pipeline:
    1. Get all embedded files from DB
    2. Get their embeddings from FAISS
    3. Run HDBSCAN
    4. Run UMAP for 2D projection
    5. Return cluster assignments and UMAP coordinates

    Returns dict with cluster info.
    """
    files = await db.get_embedded_files()

    if not files:
        logger.warning("No embedded files to cluster")
        return {"clusters": [], "umap": [], "files": []}

    # Get embeddings from FAISS in order of faiss_id
    all_embeddings = vector_store.get_all_embeddings()

    # Build parallel arrays: embeddings for just our files
    file_embeddings = []
    valid_files = []
    for f in files:
        fid = f["faiss_id"]
        if fid is not None and fid < all_embeddings.shape[0]:
            file_embeddings.append(all_embeddings[fid])
            valid_files.append(f)

    if not valid_files:
        logger.warning("No valid embeddings found")
        return {"clusters": [], "umap": [], "files": []}

    embeddings_matrix = np.vstack(file_embeddings).astype(np.float32)

    # Rebuild FAISS index from scratch to eliminate orphaned vectors
    new_faiss_ids = vector_store.rebuild(embeddings_matrix)
    for i, f in enumerate(valid_files):
        await db.update_file_embedding(f["id"], new_faiss_ids[i])
        valid_files[i] = {**f, "faiss_id": new_faiss_ids[i]}
    logger.info(f"Rebuilt FAISS index: {len(new_faiss_ids)} vectors")

    # Run agglomerative clustering with cosine distance
    labels = run_agglomerative(embeddings_matrix)

    # Run UMAP
    umap_coords = run_umap(embeddings_matrix)

    # Clear old cluster assignments
    await db.clear_clusters()

    # Build cluster info
    unique_labels = set(labels)
    cluster_map = {}  # label -> list of files

    for i, (f, label) in enumerate(zip(valid_files, labels)):
        label = int(label)
        if label not in cluster_map:
            cluster_map[label] = []
        cluster_map[label].append({
            "file_id": f["id"],
            "filename": f["filename"],
            "path": f["path"],
            "umap_x": float(umap_coords[i][0]),
            "umap_y": float(umap_coords[i][1]),
        })

    # Store cluster assignments
    cluster_results = []
    for label, cluster_files_list in cluster_map.items():
        cluster_name = f"Cluster {label}" if label >= 0 else "Unclustered"

        if label >= 0:
            cluster_id = await db.upsert_cluster(
                label=label,
                name=cluster_name,
                file_count=len(cluster_files_list),
            )
        else:
            cluster_id = -1

        # Update file records
        for cf in cluster_files_list:
            await db.update_file_cluster(cf["file_id"], label, cluster_name)

        cluster_results.append({
            "label": label,
            "name": cluster_name,
            "file_count": len(cluster_files_list),
            "files": cluster_files_list,
        })

    result = {
        "clusters": cluster_results,
        "umap": [
            {
                "file_id": valid_files[i]["id"],
                "filename": valid_files[i]["filename"],
                "x": float(umap_coords[i][0]),
                "y": float(umap_coords[i][1]),
                "cluster_label": int(labels[i]),
            }
            for i in range(len(valid_files))
        ],
        "total_files": len(valid_files),
        "total_clusters": len([l for l in unique_labels if l >= 0]),
    }

    logger.info(f"Clustering complete: {result['total_clusters']} clusters, {result['total_files']} files")
    return result
