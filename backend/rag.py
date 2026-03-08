"""
SEFS RAG — Retrieval-Augmented Generation chatbot using FAISS + Ollama llama3.2.
"""

import httpx
import logging
from typing import Optional

from backend.config import OLLAMA_BASE_URL, LLM_MODEL
from backend.embeddings import embed_text
from backend.vector_store import vector_store
from backend import database as db

logger = logging.getLogger("sefs.rag")

# Reusable client
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(180.0, connect=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def retrieve_context(query: str, k: int = 5) -> list[dict]:
    """
    Retrieve the k most relevant files for a query.
    Returns list of dicts with file info and content previews.
    """
    # Embed the query
    query_embedding = await embed_text(query)

    # Search FAISS
    results = vector_store.search(query_embedding, k=k)

    if not results:
        return []

    # Get file details for each result
    context_files = []
    embedded_files = await db.get_embedded_files()

    # Build faiss_id -> file mapping
    faiss_to_file = {f["faiss_id"]: f for f in embedded_files}

    for faiss_id, score in results:
        file_rec = faiss_to_file.get(faiss_id)
        if file_rec:
            context_files.append({
                "file_id": file_rec["id"],
                "filename": file_rec["filename"],
                "path": file_rec["path"],
                "content_preview": file_rec.get("content_preview", ""),
                "score": score,
                "cluster_name": file_rec.get("cluster_name", ""),
            })

    return context_files


async def chat(user_message: str, k: int = 5) -> dict:
    """
    RAG chat: retrieve relevant files, build context, generate response.
    Saves both user and assistant messages to chat history.
    Returns dict with response and context files used.
    """
    # Save user message
    await db.save_chat_message("user", user_message)

    # Retrieve context
    context_files = await retrieve_context(user_message, k=k)

    # Build context string
    if context_files:
        context_parts = []
        for i, cf in enumerate(context_files, 1):
            preview = cf["content_preview"][:300] if cf["content_preview"] else "(no preview)"
            context_parts.append(
                f"[File {i}: {cf['filename']}]\n{preview}"
            )
        context_str = "\n\n".join(context_parts)
    else:
        context_str = "(No relevant files found in the knowledge base)"

    # Build prompt
    prompt = f"""You are SEFS Assistant, a helpful AI that answers questions about the user's files. Use the file context below to answer the question. If the context doesn't contain enough information, say so honestly.

FILE CONTEXT:
{context_str}

USER QUESTION:
{user_message}

Provide a helpful, concise answer based on the file context above. Reference specific filenames when relevant."""

    # Generate response
    try:
        client = _get_client()
        response = await client.post(
            "/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.5,
                    "num_predict": 500,
                },
            },
        )
        response.raise_for_status()
        answer = response.json().get("response", "").strip()
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        answer = f"Sorry, I encountered an error generating a response: {str(e)}"

    # Save assistant message
    context_file_names = [cf["filename"] for cf in context_files]
    await db.save_chat_message("assistant", answer, context_file_names)

    return {
        "response": answer,
        "context_files": context_files,
    }
