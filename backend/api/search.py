"""Semantic code search endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_embeddings
from backend.db.database import get_db
from backend.embeddings.service import EmbeddingsService
from backend.security.auth import get_current_user
from backend.security.input_sanitizer import SanitizedQuery
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
    if current_user.get("auth") and current_user.get("user_id"):
        if not body.repo_path or not body.repo_path.strip():
            raise HTTPException(
                status_code=400,
                detail="repo_path is required for authenticated search.",
            )
        from backend.security.repo_auth import authorize_repository_access

        _, path = await authorize_repository_access(db, current_user, body.repo_path)
        validated_repo_path = str(path)
    elif body.repo_path and body.repo_path.strip():
        from backend.security.repo_auth import authorize_repository_access

        _, path = await authorize_repository_access(db, current_user, body.repo_path)
        validated_repo_path = str(path)

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
    root_norm = validated_repo_path.replace("\\", "/").rstrip("/") if validated_repo_path else ""

    for r in raw_results:
        if not isinstance(r, dict):
            continue
        meta_val = r.get("metadata")
        meta: dict[Any, Any] = meta_val if isinstance(meta_val, dict) else r
        raw_fpath = str(meta.get("file_path", "") or r.get("file_path", ""))
        norm_fpath = raw_fpath.replace("\\", "/")

        if root_norm and norm_fpath.startswith(root_norm):
            rel_file_path = norm_fpath[len(root_norm) :].lstrip("/")
        else:
            rel_file_path = norm_fpath

        entity_name = meta.get("entity_name", "") or r.get("entity_name", "")
        snippet = meta.get("source_code", "") or r.get("source_code", "") or meta.get("snippet", "")
        match_type = str(r.get("match_type") or "semantic")
        match_reasons = list(r.get("match_reasons") or ["semantic similarity"])

        raw_score = float(r.get("score", 0.0))
        # Prioritize source files over test/fixture files
        is_test = any(t in rel_file_path.lower() for t in ("/tests/", "/test/", "test_", "_test.", ".spec."))
        effective_score = raw_score if not is_test else raw_score * 0.85

        items.append(
            SearchResultItem(
                file_path=rel_file_path,
                entity_name=entity_name,
                snippet=snippet,
                score=round(effective_score, 4),
                start_line=int(meta.get("start_line", 0) or r.get("start_line", 0)),
                end_line=int(meta.get("end_line", 0) or r.get("end_line", 0)),
                match_type=match_type,
                match_reasons=match_reasons,
            )
        )

    # Sort results by effective score descending so source implementations precede tests
    items.sort(key=lambda it: it.score, reverse=True)

    return SearchResponse(
        query=sanitized.query,
        results=items,
        total=len(items),
    )
