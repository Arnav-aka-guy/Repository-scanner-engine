"""Dependency injection container – lazy-initialised singleton."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.documentation.service import DocumentationService
    from backend.embeddings.service import EmbeddingsService
    from backend.graph.service import GraphService
    from backend.llm.service import LLMService
    from backend.parser.service import ParserService
    from backend.retrieval.service import RetrievalService


class Container:
    """Holds references to all application services.

    Each service is created lazily on first access and reused afterwards.
    Thread-safety is ensured with a simple lock.
    """

    _instance: Container | None = None
    _lock: threading.Lock = threading.Lock()
    _initialised: bool = False

    def __new__(cls) -> Container:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialised = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialised:
            return
        self._parser_service: ParserService | None = None
        self._graph_service: GraphService | None = None
        self._embeddings_service: object | None = None
        self._retrieval_service: object | None = None
        self._llm_service: object | None = None
        self._documentation_service: object | None = None
        self._initialised = True

    # ── Parser ──────────────────────────────────────────────────────────

    @property
    def parser_service(self) -> ParserService:
        if self._parser_service is None:
            from backend.parser.service import ParserService

            self._parser_service = ParserService()
        return self._parser_service

    # ── Graph ───────────────────────────────────────────────────────────

    @property
    def graph_service(self) -> GraphService:
        if self._graph_service is None:
            from backend.graph.service import GraphService

            self._graph_service = GraphService()
        return self._graph_service

    # ── Embeddings ──────────────────────────────────────────────────────

    @property
    def embeddings_service(self) -> EmbeddingsService:
        if self._embeddings_service is None:
            from backend.embeddings.service import EmbeddingsService

            self._embeddings_service = EmbeddingsService()
        return self._embeddings_service  # type: ignore[return-value]

    # ── Retrieval ───────────────────────────────────────────────────────

    @property
    def retrieval_service(self) -> RetrievalService:
        if self._retrieval_service is None:
            from backend.retrieval.service import RetrievalService

            self._retrieval_service = RetrievalService(self.embeddings_service, self.graph_service)
        return self._retrieval_service  # type: ignore[return-value]

    # ── LLM ─────────────────────────────────────────────────────────────

    @property
    def llm_service(self) -> LLMService:
        if self._llm_service is None:
            from backend.llm.service import LLMService

            self._llm_service = LLMService()
        return self._llm_service  # type: ignore[return-value]

    # ── Documentation ───────────────────────────────────────────────────

    @property
    def documentation_service(self) -> DocumentationService:
        if self._documentation_service is None:
            from backend.documentation.service import DocumentationService

            self._documentation_service = DocumentationService(
                self.llm_service, self.parser_service, self.graph_service
            )
        return self._documentation_service  # type: ignore[return-value]


def get_container() -> Container:
    """Return the global Container singleton."""
    return Container()
