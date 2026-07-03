"""FastAPI dependency injection — centralised service access.

All API routes should use these ``Depends()`` callables instead of
creating their own service singletons.  This eliminates the duplicate
``_parser_service`` / ``_graph_service`` globals that were scattered
across route files and ensures every route goes through the DI container.

Usage in a route::

    from backend.api.dependencies import get_parser, get_graph, get_llm

    @router.post("/scan")
    async def scan(parser: ParserService = Depends(get_parser)):
        ...
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from backend.core.container import get_container

if TYPE_CHECKING:
    from backend.documentation.service import DocumentationService
    from backend.embeddings.service import EmbeddingsService
    from backend.graph.service import GraphService
    from backend.llm.service import LLMService
    from backend.parser.service import ParserService
    from backend.retrieval.service import RetrievalService


def get_parser() -> ParserService:
    """Provide the singleton ParserService."""
    return get_container().parser_service


def get_graph() -> GraphService:
    """Provide the singleton GraphService."""
    return get_container().graph_service


def get_embeddings() -> EmbeddingsService:
    """Provide the singleton EmbeddingsService."""
    return get_container().embeddings_service


def get_retrieval() -> RetrievalService:
    """Provide the singleton RetrievalService."""
    return get_container().retrieval_service


def get_llm() -> LLMService:
    """Provide the singleton LLMService."""
    return get_container().llm_service


def get_docs() -> DocumentationService:
    """Provide the singleton DocumentationService."""
    return get_container().documentation_service
