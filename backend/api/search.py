"""Semantic code search endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.api.dependencies import get_embeddings
from backend.embeddings.service import EmbeddingsService
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
) -> SearchResponse:
    """Run a semantic search against the indexed codebase.

    The embeddings index must have been populated via the ``/api/repository/scan``
    endpoint before calling this.
    """
    # Sanitize the query
    sanitized = SanitizedQuery(query=body.query)

    validated_repo_path: str | None = None
    if body.repo_path:
        sanitized_repo = SanitizedRepoPath(path=body.repo_path)
        path = validate_repository_path(sanitized_repo.path)
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
    for r in raw_results:
        meta = r.get("metadata", {})
        items.append(
            SearchResultItem(
                file_path=meta.get("file_path", ""),
                entity_name=meta.get("entity_name", ""),
                snippet=meta.get("source_code", ""),
                score=float(r.get("score", 0.0)),
                start_line=int(meta.get("start_line", 0)),
                end_line=int(meta.get("end_line", 0)),
            )
        )

    return SearchResponse(
        query=sanitized.query,
        results=items,
        total=len(items),
    )
