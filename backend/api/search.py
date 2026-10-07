"""Semantic code search endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_embeddings
from backend.db.database import get_db
from backend.db.models import Repository
from backend.embeddings.service import EmbeddingsService
from backend.security.auth import get_current_user
from backend.security.input_sanitizer import SanitizedQuery, SanitizedRepoPath
from backend.security.path_validator import validate_repository_path
from backend.security.rate_limiter import SEARCH_RATE, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


# ── Request / Response schemas ──────────────────────────────────────────


class SearchRequest(BaseModel):
    """Body for the search endpoint."""

    query: str = Field(..., min_length=1, max_length=2000, description="Natural-language search query")
    top_k: int = Field(default=10, ge=1, le=100, description="Maximum number of results to return")
    repo_path: str | None = Field(default=None, description="Optional repository root path for isolated repo search")


class SearchResultItem(BaseModel):
    """A single search hit."""

    file_path: str
    entity_name: str = ""
    snippet: str = ""
    score: float = 0.0
    start_line: int = 0
    end_line: int = 0
    match_type: str = "semantic"  # "semantic" | "keyword" | "hybrid"
    match_reasons: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    """Wrapper for the list of search results."""

    query: str
    results: list[SearchResultItem] = Field(default_factory=list)
    total: int = 0


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("", response_model=SearchResponse)
@router.post("/", response_model=SearchResponse)
@limiter.limit(SEARCH_RATE)
async def search(
    request: Request,
    body: SearchRequest,
    embeddings: EmbeddingsService = Depends(get_embeddings),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Run a hybrid search against the indexed codebase, scoped to owned repository."""
    # Sanitize the query
    sanitized = SanitizedQuery(query=body.query)

    validated_repo_path: str | None = None
    if body.repo_path:
        sanitized_repo = SanitizedRepoPath(path=body.repo_path)
        path = validate_repository_path(sanitized_repo.path)
        validated_repo_path = str(path)

        # Check repository ownership if user is authenticated
        if current_user.get("auth") and current_user.get("user_id"):
            user_id = int(current_user["user_id"])
            norm_path = validated_repo_path.replace("\\", "/").rstrip("/")
            stmt = select(Repository).where(
                (Repository.path == norm_path) | (Repository.source_path == norm_path)
            )
            res = await db.execute(stmt)
            repo = res.scalar_one_or_none()
            if repo and repo.user_id is not None and repo.user_id != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied: You do not own this repository.",
                )

    try:
        raw_results: list[dict] = await embeddings.search(
            sanitized.query,
            top_k=body.top_k,
            repo_path=validated_repo_path,
        )
    except Exception as exc:
        logger.error("Search failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Search failed.",
        ) from exc

    items: list[SearchResultItem] = []
    for r in raw_results:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else r
        file_path = meta.get("file_path", "") or r.get("file_path", "")
        entity_name = meta.get("entity_name", "") or r.get("entity_name", "")
        snippet = meta.get("source_code", "") or r.get("source_code", "") or meta.get("snippet", "")
        match_type = str(r.get("match_type") or "semantic")
        match_reasons = list(r.get("match_reasons") or ["semantic similarity"])

        items.append(
            SearchResultItem(
                file_path=file_path,
                entity_name=entity_name,
                snippet=snippet,
                score=float(r.get("score", 0.0)),
                start_line=int(meta.get("start_line", 0) or r.get("start_line", 0)),
                end_line=int(meta.get("end_line", 0) or r.get("end_line", 0)),
                match_type=match_type,
                match_reasons=match_reasons,
            )
        )

    return SearchResponse(
        query=sanitized.query,
        results=items,
        total=len(items),
    )
