"""High-level retrieval service combining Vector and Graph retrievers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from backend.retrieval.graph_retriever import GraphRetriever
from backend.retrieval.hybrid import HybridRetriever
from backend.retrieval.vector_retriever import VectorRetriever

if TYPE_CHECKING:
    from backend.embeddings.service import EmbeddingsService
    from backend.graph.service import GraphService
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


class RetrievalService:
    """Service façade for fetching structurally and semantically relevant code context."""

    def __init__(
        self,
        embeddings_service: EmbeddingsService,
        graph_service: GraphService,
    ) -> None:
        self.vector_retriever = VectorRetriever(embeddings_service)
        self.graph_retriever = GraphRetriever(graph_service)
        self.hybrid_retriever = HybridRetriever(self.vector_retriever, self.graph_retriever)

    async def retrieve(
        self,
        query: str,
        parsed_files: dict[str, ParsedFile],
        top_k: int = 6,
        graph_depth: int = 1,
    ) -> dict[str, Any]:
        """Perform semantic + structural query search.

        Args:
            query: The natural language search query.
            parsed_files: Active dictionary of parsed files.
            top_k: Number of semantic vector results to retrieve.
            graph_depth: Depth of graph traversal.
        """
        logger.info("Executing retrieval query for hybrid context extraction.")
        return await self.hybrid_retriever.retrieve(
            query=query,
            parsed_files=parsed_files,
            top_k=top_k,
            graph_depth=graph_depth
        )
