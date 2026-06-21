"""Semantic code search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/search", tags=["search"])


# ── Lazy service singleton ──────────────────────────────────────────────

def get_embeddings_service():
    """Return the global EmbeddingsService singleton from the DI container."""
    from backend.core.container import get_container
    return get_container().embeddings_service


# ── Request / Response schemas ──────────────────────────────────────────


class SearchRequest(BaseModel):
    """Body for the search endpoint."""

    query: str = Field(..., min_length=1, description="Natural-language search query")
    top_k: int = Field(
        default=10, ge=1, le=100, description="Maximum number of results to return"
    )


class SearchResultItem(BaseModel):
    """A single search hit."""

    file_path: str
    entity_name: str = ""
    snippet: str = ""
    score: float = 0.0


class SearchResponse(BaseModel):
    """Wrapper for the list of search results."""

    query: str
    results: list[SearchResultItem] = Field(default_factory=list)
    total: int = 0


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("/", response_model=SearchResponse)
async def search(body: SearchRequest) -> SearchResponse:
    """Run a semantic search against the indexed codebase.

    The embeddings index must have been populated via the ``/api/repository/scan``
    endpoint before calling this.
    """
    embeddings = get_embeddings_service()

    try:
        raw_results: list[dict] = await embeddings.search(body.query, top_k=body.top_k)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {exc}",
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
            )
        )

    return SearchResponse(
        query=body.query,
        results=items,
        total=len(items),
    )

