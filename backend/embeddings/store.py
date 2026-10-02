"""Vector store using FAISS for semantic search of code entities."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import faiss
import numpy as np

logger = logging.getLogger(__name__)


class VectorStore:
    """A vector database store wrapper around FAISS IndexFlatIP (Inner Product).

    Uses inner product for cosine similarity, assuming all added vectors are
    already normalized (which `EmbeddingEncoder` does by default).
    """

    def __init__(self, dimension: int = 384) -> None:
        self.dimension: int = dimension
        self.index: faiss.Index = faiss.IndexFlatIP(self.dimension)
        self.metadata: list[dict[str, Any]] = []

    def add(self, embeddings: np.ndarray, metadata: list[dict[str, Any]]) -> None:
        """Add normalized embeddings with their associated metadata to the store.

        Args:
            embeddings: 2-D numpy array of shape (N, dimension).
            metadata: List of N metadata dicts corresponding to the embeddings.
        """
        if len(embeddings) == 0:
            return

        if len(embeddings) != len(metadata):
            raise ValueError(f"Mismatch: got {len(embeddings)} embeddings and {len(metadata)} metadata items.")

        # Ensure correct type and shape
        arr = np.array(embeddings, dtype=np.float32)
        if len(arr.shape) == 1:
            arr = np.expand_dims(arr, axis=0)

        if arr.shape[1] != self.dimension:
            raise ValueError(f"Dimension mismatch: expected {self.dimension}, got {arr.shape[1]}")

        # FAISS IndexFlatIP expects L2 normalized vectors for exact Cosine similarity.
        # Since sentence_transformers.encode already normalized them, we add directly.
        self.index.add(arr)
        self.metadata.extend(metadata)
        logger.info("Added %d vectors to vector store. Total size: %d", len(metadata), len(self))

    def search(self, query_embedding: np.ndarray, top_k: int = 10) -> list[dict[str, Any]]:
        """Search the index for the most similar vectors.

        Args:
            query_embedding: 1-D or 2-D numpy array. If 1-D, it is reshaped.
            top_k: Number of nearest neighbors to return.

        Returns:
            List of search results. Each result is a dictionary:
            {"score": float, "metadata": dict}
        """
        if len(self) == 0:
            return []

        arr = np.array(query_embedding, dtype=np.float32)
        if len(arr.shape) == 1:
            arr = np.expand_dims(arr, axis=0)

        # Normalize query vector if not already normalized
        norm = np.linalg.norm(arr, axis=1, keepdims=True)
        # Avoid division by zero
        norm[norm == 0] = 1.0
        arr = arr / norm

        # Search index
        top_k = min(top_k, len(self))
        distances, indices = self.index.search(arr, top_k)

        results = []
        for dist, idx in zip(distances[0], indices[0], strict=False):
            # If the index is out of bounds or negative (indicates not found in FAISS)
            if idx < 0 or idx >= len(self.metadata):
                continue
            results.append({"score": float(dist), "metadata": self.metadata[idx]})

        return results

    def save(self, path: Path | str) -> None:
        """Save the FAISS index and the metadata list to disk.

        Args:
            path: Base path to save to (excluding extensions).
                  Will save to {path}.faiss and {path}.json.
        """
        base_path = Path(path)
        base_path.parent.mkdir(parents=True, exist_ok=True)

        faiss_file = base_path.with_suffix(".faiss")
        json_file = base_path.with_suffix(".json")

        logger.info("Saving FAISS index to %s ...", faiss_file)
        faiss.write_index(self.index, str(faiss_file))

        logger.info("Saving metadata to %s ...", json_file)
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)

        logger.info("Vector store successfully saved.")

    def load(self, path: Path | str) -> None:
        """Load the FAISS index and the metadata list from disk.

        Args:
            path: Base path to load from (excluding extensions).
        """
        base_path = Path(path)
        faiss_file = base_path.with_suffix(".faiss")
        json_file = base_path.with_suffix(".json")

        # Support legacy .pkl files for backward compatibility
        pkl_file = base_path.with_suffix(".pkl")
        metadata_file = json_file if json_file.exists() else pkl_file

        if not faiss_file.exists() or not metadata_file.exists():
            raise FileNotFoundError(
                f"Could not load vector store from {base_path}: " f".faiss or metadata file missing."
            )

        logger.info("Loading FAISS index from %s ...", faiss_file)
        self.index = faiss.read_index(str(faiss_file))
        self.dimension = self.index.d

        logger.info("Loading metadata from %s ...", metadata_file)
        with open(metadata_file, encoding="utf-8") as f:
            self.metadata = json.load(f)

        logger.info("Vector store loaded. Total size: %d vectors.", len(self))

    def clear(self) -> None:
        """Reset the vector store index and clear metadata."""
        self.index = faiss.IndexFlatIP(self.dimension)
        self.metadata = []
        logger.info("Vector store cleared.")

    def __len__(self) -> int:
        """Return the number of stored vectors."""
        return len(self.metadata)
