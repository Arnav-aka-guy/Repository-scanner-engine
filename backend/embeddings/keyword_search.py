"""Simple inverted-index keyword search over code entities.

Complements the vector-based FAISS search with exact token matching,
especially useful for finding entities by name.
"""

from __future__ import annotations

import logging
import math
import re
from collections import Counter, defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class KeywordSearcher:
    """Inverted-index keyword search with BM25-style scoring."""

    # BM25 tuning parameters
    K1 = 1.5
    B = 0.75

    def __init__(self) -> None:
        self.index: dict[str, list[int]] = defaultdict(list)  # token → [doc_ids]
        self.documents: list[dict[str, Any]] = []
        self.doc_lengths: list[int] = []
        self.avg_doc_length: float = 0.0
        self._built = False

    def index_documents(self, metadata_list: list[dict[str, Any]]) -> None:
        """Build inverted index from entity metadata.

        Each metadata dict should have keys like:
        entity_name, entity_type, file_path, source_code, docstring
        """
        self.documents = metadata_list
        self.index.clear()
        self.doc_lengths.clear()

        for doc_id, meta in enumerate(metadata_list):
            # Combine searchable fields into one text
            text = " ".join([
                meta.get("entity_name", ""),
                meta.get("entity_type", ""),
                meta.get("file_path", ""),
                meta.get("docstring", ""),
            ]).lower()

            tokens = self._tokenize(text)
            self.doc_lengths.append(len(tokens))

            # Build inverted index
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.index[token].append(doc_id)

        total_lengths = sum(self.doc_lengths) if self.doc_lengths else 1
        self.avg_doc_length = total_lengths / max(len(self.documents), 1)
        self._built = True

        logger.info(
            "Keyword index built: %d documents, %d unique tokens",
            len(self.documents),
            len(self.index),
        )

    def search(self, query: str, top_k: int = 20) -> list[dict[str, Any]]:
        """Search documents using BM25 scoring.

        Returns list of dicts with 'doc_id', 'score', and original metadata.
        """
        if not self._built or not self.documents:
            return []

        query_tokens = self._tokenize(query.lower())
        if not query_tokens:
            return []

        n = len(self.documents)
        scores: dict[int, float] = defaultdict(float)

        for token in query_tokens:
            if token not in self.index:
                continue

            posting = self.index[token]
            df = len(posting)  # document frequency
            idf = math.log((n - df + 0.5) / (df + 0.5) + 1.0)

            for doc_id in posting:
                dl = self.doc_lengths[doc_id]
                # Approximate tf as 1 (we stored unique tokens)
                tf = 1.0
                numerator = tf * (self.K1 + 1)
                denominator = tf + self.K1 * (1 - self.B + self.B * dl / self.avg_doc_length)
                scores[doc_id] += idf * numerator / denominator

        # Sort by score descending
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        results: list[dict[str, Any]] = []
        for doc_id, score in ranked:
            result = dict(self.documents[doc_id])
            result["doc_id"] = doc_id
            result["keyword_score"] = score
            results.append(result)

        return results

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Split text into searchable tokens."""
        # Split on non-alphanumeric, also split camelCase and snake_case
        text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)  # camelCase
        text = text.replace("_", " ").replace("-", " ").replace("/", " ").replace("\\", " ")
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        # Remove very short tokens
        return [t for t in tokens if len(t) >= 2]
