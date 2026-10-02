"""Embedding encoder using SentenceTransformers.

Wraps a SentenceTransformer model with lazy loading to avoid heavy
initialization costs at import time, with mock support for fast tests/CI.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Default dimension for the all-MiniLM-L6-v2 model.
_DEFAULT_DIMENSION: int = 384


class EmbeddingEncoder:
    """Encode text into dense vector embeddings using SentenceTransformers.

    The underlying model is loaded lazily on first use so that importing
    this module stays fast. Supports a lightweight deterministic mock mode
    when ``MOCK_EMBEDDINGS=true`` or ``model_name='mock'`` for ultra-fast CI/testing.

    Args:
        model_name: HuggingFace model identifier. Defaults to
            ``"all-MiniLM-L6-v2"`` (384-dim, fast, good quality).
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self._model_name: str = model_name
        self._model: SentenceTransformer | None = None
        self._dimension: int = _DEFAULT_DIMENSION

    def _is_mock(self) -> bool:
        """Check if mock embedding mode is requested."""
        return os.environ.get("MOCK_EMBEDDINGS", "").lower() in ("true", "1") or self._model_name == "mock"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_model(self) -> None:
        """Load the SentenceTransformer model on first use."""
        if self._is_mock():
            self._dimension = _DEFAULT_DIMENSION
            return

        if self._model is not None:
            return

        from sentence_transformers import SentenceTransformer

        logger.info("Loading SentenceTransformer model '%s' …", self._model_name)
        self._model = SentenceTransformer(self._model_name)
        self._dimension = self._model.get_sentence_embedding_dimension()  # type: ignore[assignment]
        logger.info("Model loaded – embedding dimension: %d", self._dimension)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode a batch of texts into embeddings.

        Args:
            texts: Texts to encode.

        Returns:
            A 2-D ``np.ndarray`` of shape ``(len(texts), dimension)``
            with ``float32`` values.
        """
        if self._is_mock():
            if not texts:
                return np.empty((0, self._dimension), dtype=np.float32)
            results: list[np.ndarray] = []
            for t in texts:
                seed = int(hashlib.sha256(t.encode("utf-8")).hexdigest()[:8], 16)
                rng = np.random.default_rng(seed)
                vec = rng.standard_normal(self._dimension).astype(np.float32)
                norm = np.linalg.norm(vec)
                vec /= norm if norm > 0 else 1.0
                results.append(vec)
            return np.vstack(results).astype(np.float32)

        self._ensure_model()
        assert self._model is not None  # noqa: S101 – guarded by _ensure_model

        embeddings: np.ndarray = self._model.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return embeddings.astype(np.float32)

    def encode_single(self, text: str) -> np.ndarray:
        """Encode a single text string into an embedding vector.

        Args:
            text: The text to encode.

        Returns:
            A 1-D ``np.ndarray`` of shape ``(dimension,)``.
        """
        res = self.encode([text])[0]
        return np.asarray(res, dtype=np.float32)

    @property
    def dimension(self) -> int:
        """Return the embedding dimension."""
        return self._dimension
