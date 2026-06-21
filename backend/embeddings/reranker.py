"""Reciprocal Rank Fusion (RRF) reranker for hybrid search results.

Merges results from vector search and keyword search into a single
ranked list using the RRF algorithm.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# RRF constant — controls how much weight is given to rank vs. later positions
RRF_K = 60


class SearchReranker:
    """Merges and reranks results from multiple search sources."""

    def rerank(
        self,
        vector_results: list[dict[str, Any]],
        keyword_results: list[dict[str, Any]],
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """Merge vector and keyword results using Reciprocal Rank Fusion.

        Each result dict must have a unique identifying key.
        We use 'entity_name' + 'file_path' as the dedup key.
        """
        # Build RRF scores
        rrf_scores: dict[str, float] = {}
        result_map: dict[str, dict[str, Any]] = {}

        # Process vector results
        for rank, result in enumerate(vector_results):
            key = self._result_key(result)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            if key not in result_map:
                result_map[key] = result

        # Process keyword results
        for rank, result in enumerate(keyword_results):
            key = self._result_key(result)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            if key not in result_map:
                result_map[key] = result

        # Sort by combined RRF score
        ranked_keys = sorted(rrf_scores.keys(), key=lambda k: rrf_scores[k], reverse=True)

        # Build final results
        merged: list[dict[str, Any]] = []
        for key in ranked_keys[:top_k]:
            result = dict(result_map[key])
            result["rrf_score"] = rrf_scores[key]
            # Normalize to 0-1 range for display
            max_possible = 2.0 / (RRF_K + 1)  # Both sources rank it #1
            result["score"] = min(rrf_scores[key] / max_possible, 1.0)
            merged.append(result)

        logger.debug(
            "RRF reranked: %d vector + %d keyword → %d merged results",
            len(vector_results),
            len(keyword_results),
            len(merged),
        )

        return merged

    @staticmethod
    def _result_key(result: dict[str, Any]) -> str:
        """Generate a unique key for deduplication."""
        name = result.get("entity_name", "")
        path = result.get("file_path", "")
        return f"{path}::{name}"
