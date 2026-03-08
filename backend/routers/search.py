"""
SEFS Search Router — hybrid NLP search combining semantic + keyword search.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from backend.embeddings import embed_text, check_ollama_health
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
    Hybrid NLP search: combines semantic (embedding) search with keyword search.
    Falls back to keyword-only when Ollama is unavailable.
    """
    if not req.query.strip():
        return {"results": [], "query": req.query}

    semantic_results = {}
    keyword_results = {}
    ollama_available = False

    # 1. Try semantic search via Ollama
    try:
        ollama_available = await check_ollama_health()
        if ollama_available and vector_store.total > 0:
            query_embedding = await embed_text(req.query)
            faiss_results = vector_store.search(query_embedding, k=req.k)

            if faiss_results:
                embedded_files = await db.get_embedded_files()
                faiss_to_file = {f["faiss_id"]: f for f in embedded_files}

                for faiss_id, score in faiss_results:
                    file_rec = faiss_to_file.get(faiss_id)
                    if file_rec:
                        semantic_results[file_rec["id"]] = {
                            "file_id": file_rec["id"],
                            "filename": file_rec["filename"],
                            "path": file_rec["path"],
                            "extension": file_rec.get("extension", ""),
                            "content_preview": file_rec.get("content_preview", "")[:300],
                            "cluster_name": file_rec.get("cluster_name", ""),
                            "cluster_id": file_rec.get("cluster_id"),
                            "semantic_score": float(score),
                            "keyword_score": 0.0,
                        }
    except Exception as e:
        logger.warning(f"Semantic search failed (falling back to keyword): {e}")

    # 2. Always do keyword search as supplement/fallback
    try:
        kw_results = await db.keyword_search_files(req.query, k=req.k)
        for file_rec in kw_results:
            fid = file_rec["id"]
            keyword_results[fid] = {
                "file_id": fid,
                "filename": file_rec["filename"],
                "path": file_rec["path"],
                "extension": file_rec.get("extension", ""),
                "content_preview": (file_rec.get("content_preview") or "")[:300],
                "cluster_name": file_rec.get("cluster_name", ""),
                "cluster_id": file_rec.get("cluster_id"),
                "semantic_score": 0.0,
                "keyword_score": file_rec.get("keyword_score", 0.0),
            }
    except Exception as e:
        logger.warning(f"Keyword search failed: {e}")

    # 3. Merge results
    merged = {}
    for fid, result in semantic_results.items():
        merged[fid] = result.copy()
    for fid, result in keyword_results.items():
        if fid in merged:
            merged[fid]["keyword_score"] = result["keyword_score"]
        else:
            merged[fid] = result.copy()

    # 4. Compute final combined score
    for fid, result in merged.items():
        sem = result["semantic_score"]
        kw = result["keyword_score"]
        if ollama_available and sem > 0 and kw > 0:
            result["score"] = round(0.6 * sem + 0.3 * kw + 0.1, 4)
        elif sem > 0:
            result["score"] = round(sem, 4)
        elif kw > 0:
            result["score"] = round(kw, 4)
        else:
            result["score"] = 0.0

    # 5. Sort and return top k
    final = sorted(merged.values(), key=lambda x: x["score"], reverse=True)[:req.k]
    for r in final:
        r.pop("semantic_score", None)
        r.pop("keyword_score", None)

    return {
        "results": final,
        "query": req.query,
        "total": len(final),
        "method": "hybrid" if ollama_available else "keyword",
    }
