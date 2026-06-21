"""Embedding encoder using SentenceTransformers.

Wraps a SentenceTransformer model with lazy loading to avoid heavy
initialization costs at import time.
"""

from __future__ import annotations

import logging
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
    this module stays fast.

    Args:
        model_name: HuggingFace model identifier.  Defaults to
            ``"all-MiniLM-L6-v2"`` (384-dim, fast, good quality).
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self._model_name: str = model_name
        self._model: SentenceTransformer | None = None
        self._dimension: int = _DEFAULT_DIMENSION

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_model(self) -> None:
        """Load the SentenceTransformer model on first use.

        This keeps application startup fast by deferring the heavy
        model-loading step until embeddings are actually needed.
        """
        if self._model is not None:
            return

        from sentence_transformers import SentenceTransformer

        logger.info("Loading SentenceTransformer model '%s' …", self._model_name)
        self._model = SentenceTransformer(self._model_name)
        self._dimension = self._model.get_sentence_embedding_dimension()  # type: ignore[assignment]
        logger.info(
            "Model loaded – embedding dimension: %d", self._dimension
        )

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
        return self.encode([text])[0]

    @property
    def dimension(self) -> int:
        """Return the embedding dimension.

        For the default ``all-MiniLM-L6-v2`` model this is **384**.
        The value is updated to the true model dimension once the model
        is loaded.
        """
        return self._dimension
