"""Hybrid code retriever combining Vector search and Graph relationship traversal."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from backend.retrieval.graph_retriever import GraphRetriever
from backend.retrieval.vector_retriever import VectorRetriever

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


class HybridRetriever:
    """Combines vector embeddings search and Graph structural traversal for enhanced RAG context."""

    def __init__(self, vector_retriever: VectorRetriever, graph_retriever: GraphRetriever) -> None:
        self.vector_retriever = vector_retriever
        self.graph_retriever = graph_retriever

    async def retrieve(
        self,
        query: str,
        parsed_files: dict[str, ParsedFile],
        top_k: int = 6,
        graph_depth: int = 1,
        repo_path: str | None = None,
    ) -> dict[str, Any]:
        """Perform hybrid retrieval: Vector Search + Graph Neighbor Context.

        Args:
            query: The search query in natural language.
            parsed_files: Dict of file paths to ParsedFile.
            top_k: Number of vector matches.
            graph_depth: Breadth depth in graph traversal.
            repo_path: Optional repository root path for isolated repo search.

        Returns:
            Dict containing vector results, graph results, and merged text context.
        """
        # 1. Perform vector semantic search
        vector_results = await self.vector_retriever.retrieve(query, top_k=top_k, repo_path=repo_path)

        # 2. Extract entity names from top vector matches to seed graph traversal
        entity_names = []
        for res in vector_results[:3]:  # Seed with top 3 vector matches
            name = res["entity_name"]
            if name and name not in entity_names:
                entity_names.append(name)

        # 3. Perform graph expansion to find related nodes
        graph_results = []
        if entity_names:
            graph_results = await self.graph_retriever.retrieve(entity_names, parsed_files, depth=graph_depth)

        # 4. Merge and deduplicate
        seen_entities = set()
        merged_entities = []

        # Prioritize vector results
        for res in vector_results:
            key = (res["file_path"], res["entity_name"])
            if key not in seen_entities:
                seen_entities.add(key)
                merged_entities.append(res)

        # Add related graph entities
        for res in graph_results:
            key = (res["file_path"], res["entity_name"])
            if key not in seen_entities:
                seen_entities.add(key)
                merged_entities.append(res)

        # 5. Build final context text string
        context_str = self._build_context(merged_entities)

        return {"vector_results": vector_results, "graph_results": graph_results, "merged_context": context_str}

    def _build_context(self, entities: list[dict[str, Any]]) -> str:
        """Format retrieved code entities into a formatted prompt context block."""
        if not entities:
            return "No relevant code context was found in the repository."

        blocks = []
        for idx, ent in enumerate(entities):
            source = ent.get("source_code") or ""
            doc = ent.get("docstring") or "No documentation available."
            rel = f" ({ent['relation_to_query']})" if "relation_to_query" in ent else ""

            block = (
                f"--- [Context Item #{idx + 1}] ---\n"
                f"Entity Name: {ent['entity_name']}\n"
                f"Entity Type: {ent['entity_type']}{rel}\n"
                f"File Path: {ent['file_path']}\n"
                f"Line Range: {ent['start_line']} to {ent['end_line']}\n"
                f"Docstring: {doc}\n"
            )
            if source:
                block += f"Source Code:\n```python\n{source}\n```"
            else:
                block += "[Source code not available for this entity type]"

            blocks.append(block)

        return "\n\n".join(blocks)
