"""
SEFS Cluster Namer — Uses Ollama llama3.2 to generate semantic names for clusters.
"""

import httpx
import logging
import re
from typing import Optional

from backend.config import OLLAMA_BASE_URL, LLM_MODEL
from backend import database as db

logger = logging.getLogger("sefs.cluster_namer")

# Reusable client
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(120.0, connect=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def generate_cluster_name(filenames: list[str], previews: list[str]) -> str:
    """
    Ask llama3.2 to generate a short, descriptive folder name for a group of files.
    Returns a clean folder-safe name like "machine-learning-notes".
    """
    # Build context from filenames and content previews
    file_info = []
    for fname, preview in zip(filenames, previews):
        snippet = preview[:500].replace("\n", " ").strip() if preview else ""
        file_info.append(f"- {fname}: {snippet}")

    files_text = "\n".join(file_info[:10])  # Limit to 10 files for prompt size

    prompt = f"""You are a file organization expert. Read each file's content carefully and identify the PRIMARY TOPIC — the central subject that the content is actually about.

Do NOT be misled by shared keywords. For example, a file about "stellar mass" is about astrophysics, not biology, even though biology also uses the word "mass".

Files in this cluster:
{files_text}

Generate a folder name that captures the dominant, unifying topic of ALL these files.

Rules:
- 2-4 words, lowercase, hyphens between words
- Be specific: prefer "stellar-astrophysics" over "science-files"
- No generic names like "misc", "documents", "general"
- Only lowercase letters, numbers, and hyphens

Respond with ONLY the folder name, nothing else."""

    try:
        client = _get_client()
        response = await client.post(
            "/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 30,
                },
            },
        )
        response.raise_for_status()
        raw_name = response.json().get("response", "").strip()

        # Clean it to be folder-safe
        name = sanitize_folder_name(raw_name)
        logger.info(f"Generated cluster name: '{raw_name}' -> '{name}'")
        return name

    except Exception as e:
        logger.error(f"Cluster naming failed: {e}")
        return "unnamed-cluster"


def sanitize_folder_name(raw: str) -> str:
    """Clean a raw LLM response into a safe folder name."""
    # Take first line only
    name = raw.split("\n")[0].strip().strip('"').strip("'").strip("`")
    # Lowercase
    name = name.lower()
    # Replace spaces and underscores with hyphens
    name = name.replace(" ", "-").replace("_", "-")
    # Remove any character that isn't alphanumeric or hyphen
    name = re.sub(r"[^a-z0-9\-]", "", name)
    # Collapse multiple hyphens
    name = re.sub(r"-+", "-", name).strip("-")
    # Truncate
    if len(name) > 50:
        name = name[:50].rstrip("-")
    # Fallback
    if not name:
        name = "unnamed-cluster"
    return name


async def name_all_clusters(cluster_data: dict) -> dict:
    """
    Name all clusters using the LLM.
    Modifies cluster_data in-place and updates the database.
    Returns updated cluster_data.
    """
    for cluster in cluster_data.get("clusters", []):
        label = cluster["label"]

        # Skip noise cluster
        if label < 0:
            continue

        filenames = [f["filename"] for f in cluster["files"]]

        # Get previews from database
        previews = []
        for f in cluster["files"]:
            file_rec = await db.get_file_by_id(f["file_id"])
            previews.append(file_rec.get("content_preview", "") if file_rec else "")

        # Generate name
        name = await generate_cluster_name(filenames, previews)
        cluster["name"] = name

        # Update database
        await db.upsert_cluster(
            label=label,
            name=name,
            file_count=cluster["file_count"],
        )

        # Update file records
        for f in cluster["files"]:
            await db.update_file_cluster(f["file_id"], label, name)

    # Also update UMAP data with names
    cluster_name_map = {c["label"]: c["name"] for c in cluster_data.get("clusters", [])}
    for point in cluster_data.get("umap", []):
        point["cluster_name"] = cluster_name_map.get(point["cluster_label"], "Unclustered")

    logger.info(f"Named {len(cluster_data.get('clusters', []))} clusters")
    return cluster_data
