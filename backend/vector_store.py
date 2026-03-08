"""
SEFS Vector Store — FAISS index management for embedding storage and similarity search.
"""

import faiss
import numpy as np
import logging
from pathlib import Path
from typing import Optional

import backend.config as config
from backend.config import EMBED_DIMENSION

logger = logging.getLogger("sefs.vector_store")


class VectorStore:
    """
    Manages a FAISS IndexFlatIP (inner-product / cosine similarity on normalized vectors).
    FAISS IDs are sequential integers; the mapping to file IDs is kept in SQLite.
    """

    def __init__(self) -> None:
        self.index: Optional[faiss.IndexFlatIP] = None
        self._next_id: int = 0

    def _create_empty_index(self) -> faiss.IndexFlatIP:
        """Create a fresh empty FAISS index."""
        index = faiss.IndexFlatIP(EMBED_DIMENSION)
        logger.info(f"Created new FAISS index with dimension {EMBED_DIMENSION}")
        return index

    def load_or_create(self) -> None:
        """Load FAISS index from disk or create a new one."""
        if config.FAISS_INDEX_PATH.exists():
            try:
                self.index = faiss.read_index(str(config.FAISS_INDEX_PATH))
                self._next_id = self.index.ntotal
                logger.info(f"Loaded FAISS index with {self.index.ntotal} vectors")
            except Exception as e:
                logger.error(f"Failed to load FAISS index: {e}. Creating new.")
                self.index = self._create_empty_index()
                self._next_id = 0
        else:
            self.index = self._create_empty_index()
            self._next_id = 0

    def save(self) -> None:
        """Save FAISS index to disk."""
        if self.index is not None:
            config.FAISS_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
            faiss.write_index(self.index, str(config.FAISS_INDEX_PATH))
            logger.info(f"Saved FAISS index ({self.index.ntotal} vectors) to {config.FAISS_INDEX_PATH}")

    def add(self, embedding: np.ndarray) -> int:
        """
        Add a single embedding to the index.
        Returns the FAISS internal ID (sequential).
        """
        if self.index is None:
            self.load_or_create()

        # Normalize for cosine similarity
        embedding = embedding.reshape(1, -1).astype(np.float32)
        faiss.normalize_L2(embedding)

        faiss_id = self._next_id
        self.index.add(embedding)
        self._next_id += 1

        return faiss_id

    def add_batch(self, embeddings: np.ndarray) -> list[int]:
        """
        Add a batch of embeddings. Returns list of FAISS IDs.
        embeddings shape: (n, EMBED_DIMENSION)
        """
        if self.index is None:
            self.load_or_create()

        embeddings = embeddings.astype(np.float32)
        faiss.normalize_L2(embeddings)

        start_id = self._next_id
        self.index.add(embeddings)
        self._next_id += embeddings.shape[0]

        return list(range(start_id, self._next_id))

    def search(self, query_embedding: np.ndarray, k: int = 10) -> list[tuple[int, float]]:
        """
        Search for the k nearest neighbors.
        Returns list of (faiss_id, score) tuples, sorted by descending similarity.
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        # Clamp k to available vectors
        k = min(k, self.index.ntotal)

        query = query_embedding.reshape(1, -1).astype(np.float32)
        faiss.normalize_L2(query)

        scores, ids = self.index.search(query, k)

        results = []
        for score, idx in zip(scores[0], ids[0]):
            if idx >= 0:  # FAISS returns -1 for missing results
                results.append((int(idx), float(score)))

        return results

    def get_all_embeddings(self) -> np.ndarray:
        """
        Reconstruct all embeddings from the index.
        Returns array of shape (n, EMBED_DIMENSION).
        """
        if self.index is None or self.index.ntotal == 0:
            return np.zeros((0, EMBED_DIMENSION), dtype=np.float32)

        n = self.index.ntotal
        embeddings = np.zeros((n, EMBED_DIMENSION), dtype=np.float32)
        for i in range(n):
            embeddings[i] = self.index.reconstruct(i)
        return embeddings

    def rebuild(self, embeddings: np.ndarray) -> list[int]:
        """
        Rebuild the entire index from scratch with new embeddings.
        Returns list of new FAISS IDs.
        """
        self.index = self._create_empty_index()
        self._next_id = 0

        if embeddings.shape[0] == 0:
            self.save()
            return []

        ids = self.add_batch(embeddings)
        self.save()
        return ids

    @property
    def total(self) -> int:
        """Number of vectors in the index."""
        return self.index.ntotal if self.index else 0

    def reset(self) -> None:
        """Reset the index to empty."""
        self.index = self._create_empty_index()
        self._next_id = 0
        self.save()


# Singleton instance
vector_store = VectorStore()
