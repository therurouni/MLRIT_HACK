"""
SEFS Embeddings — Ollama nomic-embed-text client for generating embeddings.
"""

import httpx
import logging
import numpy as np
from typing import Optional

from backend.config import OLLAMA_BASE_URL, EMBED_MODEL, EMBED_DIMENSION

logger = logging.getLogger("sefs.embeddings")

# Reusable async client with generous timeout (embedding can be slow first time)
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
    """Close the HTTP client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def embed_text(text: str) -> np.ndarray:
    """
    Embed a single text string using Ollama nomic-embed-text.
    Returns a numpy array of shape (EMBED_DIMENSION,).
    """
    client = _get_client()

    # Truncate very long texts to ~8000 tokens (~32000 chars) to stay within model limits
    if len(text) > 32000:
        text = text[:32000]

    try:
        response = await client.post(
            "/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
        )
        response.raise_for_status()
        data = response.json()
        embedding = np.array(data["embedding"], dtype=np.float32)

        if embedding.shape[0] != EMBED_DIMENSION:
            logger.warning(
                f"Expected dimension {EMBED_DIMENSION}, got {embedding.shape[0]}"
            )

        return embedding

    except httpx.HTTPStatusError as e:
        logger.error(f"Ollama embedding API error: {e.response.status_code} - {e.response.text}")
        raise
    except httpx.ConnectError:
        logger.error(f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. Is it running?")
        raise
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise


async def embed_texts(texts: list[str]) -> np.ndarray:
    """
    Embed multiple texts. Returns array of shape (n, EMBED_DIMENSION).
    Processes sequentially since Ollama handles one request at a time.
    """
    embeddings = []
    for text in texts:
        emb = await embed_text(text)
        embeddings.append(emb)

    return np.vstack(embeddings) if embeddings else np.zeros((0, EMBED_DIMENSION), dtype=np.float32)


async def check_ollama_health() -> bool:
    """Check if Ollama is reachable and the embed model is available."""
    try:
        client = _get_client()
        response = await client.get("/api/tags")
        response.raise_for_status()
        models = response.json().get("models", [])
        model_names = [m["name"] for m in models]
        if EMBED_MODEL not in model_names:
            logger.warning(f"Model {EMBED_MODEL} not found. Available: {model_names}")
            return False
        return True
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
        return False
