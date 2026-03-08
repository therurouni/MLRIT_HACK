"""
SEFS Search Router — semantic search over embedded files.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from backend.embeddings import embed_text
from backend.vector_store import vector_store
from backend import database as db

logger = logging.getLogger("sefs.routers.search")
router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    k: int = 10


@router.post("")
async def semantic_search(req: SearchRequest):
    """
    Semantic search: embed the query and find the most similar files.
    """
    if not req.query.strip():
        return {"results": [], "query": req.query}

    # Embed query
    query_embedding = await embed_text(req.query)

    # Search FAISS
    faiss_results = vector_store.search(query_embedding, k=req.k)

    if not faiss_results:
        return {"results": [], "query": req.query}

    # Map faiss IDs back to file records
    embedded_files = await db.get_embedded_files()
    faiss_to_file = {f["faiss_id"]: f for f in embedded_files}

    results = []
    for faiss_id, score in faiss_results:
        file_rec = faiss_to_file.get(faiss_id)
        if file_rec:
            results.append({
                "file_id": file_rec["id"],
                "filename": file_rec["filename"],
                "path": file_rec["path"],
                "extension": file_rec.get("extension", ""),
                "content_preview": file_rec.get("content_preview", "")[:300],
                "cluster_name": file_rec.get("cluster_name", ""),
                "score": round(score, 4),
            })

    return {"results": results, "query": req.query, "total": len(results)}
