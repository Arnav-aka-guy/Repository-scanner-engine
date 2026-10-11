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
    from sqlalchemy import select

    from backend.db.models import Repository
    from backend.security.input_sanitizer import SanitizedRepoPath
    from backend.security.path_validator import validate_repository_path

    # 1. Lookup by repository_id if provided
    if repository_id is not None:
        stmt = select(Repository).where(Repository.id == repository_id)
        res = await db.execute(stmt)
        repo = res.scalar_one_or_none()
        if not repo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
        if current_user.get("auth") and current_user.get("user_id"):
            user_id = int(current_user["user_id"])
            if repo.user_id is not None and repo.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
        target_path = repo.source_path or repo.path
        return validate_repository_path(target_path)

    # 2. Lookup by repo_path
    if not repo_path or not repo_path.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either repo_path or repository_id must be provided.",
        )

    sanitized = SanitizedRepoPath(path=repo_path)
    path = validate_repository_path(sanitized.path)
    norm_path = str(path).replace("\\", "/").rstrip("/")

    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        if db is not None:
            stmt = select(Repository).where((Repository.path == norm_path) | (Repository.source_path == norm_path))
            res = await db.execute(stmt)
            repo = res.scalar_one_or_none()
            if repo and repo.user_id is not None and repo.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to access this repository.",
                )

    return path


async def verify_repo_ownership(
    repo_path: str,
    current_user: dict[str, Any],
    db: Any,
) -> Path:
    """Helper to validate ownership for JSON body endpoints that receive repo_path."""
    from fastapi import HTTPException, status
    from sqlalchemy import select

    from backend.db.models import Repository
    from backend.security.input_sanitizer import SanitizedRepoPath
    from backend.security.path_validator import validate_repository_path

    sanitized = SanitizedRepoPath(path=repo_path)
    path = validate_repository_path(sanitized.path)
    norm_path = str(path).replace("\\", "/").rstrip("/")

    if current_user and current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        if db is not None:
            stmt = select(Repository).where((Repository.path == norm_path) | (Repository.source_path == norm_path))
            res = await db.execute(stmt)
            repo = res.scalar_one_or_none()
            if repo and repo.user_id is not None and repo.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to access this repository.",
                )

    return path
