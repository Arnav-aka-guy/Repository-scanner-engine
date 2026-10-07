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
        in_vector: set[str] = set()
        in_keyword: set[str] = set()
        vec_scores: dict[str, float] = {}
        kw_scores: dict[str, float] = {}

        # Process vector results
        for rank, result in enumerate(vector_results):
            key = self._result_key(result)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            in_vector.add(key)
            if "score" in result:
                vec_scores[key] = float(result["score"])
            if key not in result_map:
                result_map[key] = result

        # Process keyword results
        for rank, result in enumerate(keyword_results):
            key = self._result_key(result)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            in_keyword.add(key)
            if "keyword_score" in result:
                kw_scores[key] = float(result["keyword_score"])
            if key not in result_map:
                result_map[key] = result

        # Sort by combined RRF score
        ranked_keys = sorted(rrf_scores.keys(), key=lambda k: rrf_scores[k], reverse=True)

        # Build final results
        merged: list[dict[str, Any]] = []
        max_possible = 2.0 / (RRF_K + 1)  # Both sources rank it #1

        for key in ranked_keys[:top_k]:
            source_item = result_map[key]
            meta = source_item.get("metadata") if isinstance(source_item.get("metadata"), dict) else source_item

            is_vec = key in in_vector
            is_kw = key in in_keyword

            if is_vec and is_kw:
                match_type = "hybrid"
                match_reasons = ["semantic similarity", "keyword match"]
            elif is_kw:
                match_type = "keyword"
                match_reasons = ["keyword match"]
            else:
                match_type = "semantic"
                match_reasons = ["semantic similarity"]

            item: dict[str, Any] = {
                "score": min(rrf_scores[key] / max_possible, 1.0),
                "rrf_score": rrf_scores[key],
                "match_type": match_type,
                "match_reasons": match_reasons,
                "metadata": meta,
                # Flattened keys for convenience and backward compatibility
                "file_path": meta.get("file_path", ""),
                "entity_name": meta.get("entity_name", ""),
                "entity_type": meta.get("entity_type", ""),
                "start_line": int(meta.get("start_line", 0)),
                "end_line": int(meta.get("end_line", 0)),
                "source_code": meta.get("source_code", ""),
                "docstring": meta.get("docstring", ""),
            }
            if key in vec_scores:
                item["vector_score"] = vec_scores[key]
            if key in kw_scores:
                item["keyword_score"] = kw_scores[key]

            merged.append(item)

        logger.debug(
            "RRF reranked: %d vector + %d keyword -> %d merged results",
            len(vector_results),
            len(keyword_results),
            len(merged),
        )

        return merged

    @staticmethod
    def _result_key(result: dict[str, Any]) -> str:
        """Generate a unique key for deduplication across nested metadata and top-level fields."""
        meta = result.get("metadata") if isinstance(result.get("metadata"), dict) else result
        name = meta.get("entity_name", "") or result.get("entity_name", "")
        path = meta.get("file_path", "") or result.get("file_path", "")
        start = meta.get("start_line", 0) or result.get("start_line", 0)
        return f"{path}::{name}::{start}"
