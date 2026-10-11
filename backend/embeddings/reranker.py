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
        query: str = "",
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
                item_copy = dict(result)
                item_copy["_query"] = query
                result_map[key] = item_copy

        # Process keyword results
        for rank, result in enumerate(keyword_results):
            key = self._result_key(result)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
            in_keyword.add(key)
            if "keyword_score" in result:
                kw_scores[key] = float(result["keyword_score"])
            if key not in result_map:
                item_copy = dict(result)
                item_copy["_query"] = query
                result_map[key] = item_copy

        # Sort by combined RRF score
        ranked_keys = sorted(rrf_scores.keys(), key=lambda k: rrf_scores[k], reverse=True)

        # Build final results
        merged: list[dict[str, Any]] = []
        max_possible = 2.0 / (RRF_K + 1)  # Both sources rank it #1

        for key in ranked_keys[:top_k]:
            source_item = result_map[key]
            meta_val = source_item.get("metadata")
            meta: dict[str, Any] = (
                meta_val if isinstance(meta_val, dict) else (source_item if isinstance(source_item, dict) else {})
            )

            is_vec = key in in_vector
            is_kw = key in in_keyword

            match_reasons: list[str] = []
            if is_vec:
                match_reasons.append("semantic similarity")
            if is_kw:
                match_reasons.append("keyword match")

            entity_name = str(meta.get("entity_name", "")).strip().lower()
            file_path = str(meta.get("file_path", "")).strip().lower()
            docstring = str(meta.get("docstring", "")).strip()

            # Boost exact symbol or filename matches
            boost = 1.0
            query_words = [w.lower() for w in result_map[key].get("_query", "").split() if len(w) > 1]
            if entity_name and any(w == entity_name for w in query_words):
                boost += 0.35
                match_reasons.insert(0, f"exact symbol name '{meta.get('entity_name')}'")
            elif entity_name and any(w in entity_name for w in query_words):
                boost += 0.15
                match_reasons.append(f"symbol '{meta.get('entity_name')}' match")

            file_basename = file_path.split("/")[-1].split("\\")[-1]
            if file_basename and any(w in file_basename for w in query_words):
                boost += 0.15
                match_reasons.append(f"file path match '{file_basename}'")

            if docstring and any(w in docstring.lower() for w in query_words):
                match_reasons.append("docstring match")

            if is_vec and is_kw:
                match_type = "hybrid"
            elif is_kw:
                match_type = "keyword"
            else:
                match_type = "semantic"

            calculated_score = min(1.0, (rrf_scores[key] / max_possible) * boost)
            item: dict[str, Any] = {
                "score": calculated_score,
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
        meta_val = result.get("metadata")
        meta: dict[str, Any] = meta_val if isinstance(meta_val, dict) else (result if isinstance(result, dict) else {})
        name = meta.get("entity_name", "") or result.get("entity_name", "")
        path = meta.get("file_path", "") or result.get("file_path", "")
        start = meta.get("start_line", 0) or result.get("start_line", 0)
        return f"{path}::{name}::{start}"
