"""Vector-based code retriever utilizing FAISS embeddings."""

from __future__ import annotations

import logging
from typing import Any

from backend.embeddings.service import EmbeddingsService

logger = logging.getLogger(__name__)


class VectorRetriever:
    """Retrieve relevant code entities from vector database index using embeddings."""

    def __init__(self, embeddings_service: EmbeddingsService) -> None:
        self.embeddings_service = embeddings_service

    async def retrieve(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Retrieve code entities from vector database matching query semantic meaning.

        Args:
            query: Natural language query.
            top_k: Number of entries to retrieve.

        Returns:
            List of dictionaries representing search results, including:
            "score": float relevance score
            "file_path": relative file path of source code
            "entity_name": name of the function, class or module
            "entity_type": type of entity (module, class, method, function)
            "source_code": original source code segment
            "docstring": docstring of the entity
            "start_line": starting line in file
            "end_line": ending line in file
        """
        raw_results = await self.embeddings_service.search(query, top_k=top_k)
        
        results = []
        for res in raw_results:
            meta = res["metadata"]
            results.append({
                "score": res["score"],
                "file_path": meta.get("file_path", ""),
                "entity_name": meta.get("entity_name", ""),
                "entity_type": meta.get("entity_type", ""),
                "source_code": meta.get("source_code", ""),
                "docstring": meta.get("docstring", ""),
                "start_line": meta.get("start_line", 1),
                "end_line": meta.get("end_line", 1),
            })
            
        return results
