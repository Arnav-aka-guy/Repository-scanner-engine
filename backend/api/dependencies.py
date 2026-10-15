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

from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi import Depends, Query

from backend.core.container import get_container
from backend.db.database import get_db
from backend.security.auth import get_current_user

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


async def get_owned_repository(
    repo_path: str | None = Query(default=None, description="Absolute path to the repository root"),
    repository_id: int | None = Query(default=None, description="Database ID of the repository"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
) -> Path:
    """Validate that the requesting user owns the repository and return resolved Path.

    Supports lookup by either repository_id or repo_path. Raises 404 if repository_id is
    not found or belongs to another user. Raises 403 if repo_path belongs to another user.
    """
    from fastapi import HTTPException, status

    from backend.security.repo_auth import authorize_repository_access

    ident = repository_id if repository_id is not None else repo_path
    if ident is None or (isinstance(ident, str) and not ident.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either repo_path or repository_id must be provided.",
        )

    _, path = await authorize_repository_access(db, current_user, ident)
    return path


async def verify_repo_ownership(
    repo_path: str,
    current_user: dict[str, Any],
    db: Any,
) -> Path:
    """Helper to validate ownership for JSON body endpoints that receive repo_path."""
    from backend.security.repo_auth import authorize_repository_access

    _, path = await authorize_repository_access(db, current_user, repo_path)
    return path
