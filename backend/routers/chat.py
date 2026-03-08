"""
SEFS Chat Router — RAG chatbot endpoints.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from backend.rag import chat
from backend import database as db

logger = logging.getLogger("sefs.routers.chat")
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    k: int = 5


@router.post("")
async def chat_endpoint(req: ChatRequest):
    """Send a message to the RAG chatbot."""
    if not req.message.strip():
        return {"response": "Please enter a message.", "context_files": []}

    result = await chat(req.message, k=req.k)
    return result


@router.get("/history")
async def get_history(limit: int = 50):
    """Get chat history."""
    messages = await db.get_chat_history(limit=limit)
    return {"messages": messages, "total": len(messages)}


@router.delete("/history")
async def clear_history():
    """Clear chat history."""
    db_conn = await db.get_db()
    try:
        await db_conn.execute("DELETE FROM chat_history")
        await db_conn.commit()
    finally:
        await db_conn.close()
    return {"status": "cleared"}
