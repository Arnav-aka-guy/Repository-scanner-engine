"""System design diagram API.

Routes (all repository-scoped and ownership-checked):

* ``POST /api/system-design/generate`` – build (or return cached) diagram.
* ``GET  /api/system-design``          – return the last cached diagram, or ``null`` if none.
"""

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.security.auth import get_current_user
from backend.security.rate_limiter import limiter
from backend.services.system_design.schema import SystemDesignDiagram
from backend.services.system_design.service import get_system_design_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system-design", tags=["system-design"])

SYSTEM_DESIGN_RATE = "6/minute"


class GenerateSystemDesignRequest(BaseModel):
    repository_id: int | None = Field(default=None, description="Saved repository ID (preferred)")
    repo_path: str | None = Field(default=None, max_length=1024, description="Repository path (fallback)")
    detail: Literal["overview", "detailed"] = "overview"
    use_ai: bool = Field(default=True, description="Use Groq to enrich the diagram when configured")
    refresh: bool = Field(default=False, description="Ignore the cache and regenerate")


async def _authorize(db: AsyncSession, user: dict[str, Any], repository_id: int | None, repo_path: str | None):
    from backend.security.repo_auth import authorize_repository_access

    ident: int | str | None = repository_id if repository_id is not None else (repo_path or "").strip() or None
    if ident is None:
        raise HTTPException(status_code=400, detail="Either repository_id or repo_path must be provided.")
    _, path = await authorize_repository_access(db, user, ident)
    return path


@router.post("/generate", response_model=SystemDesignDiagram)
@limiter.limit(SYSTEM_DESIGN_RATE)
async def generate_system_design(
    request: Request,
    body: GenerateSystemDesignRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a layered system design diagram for the repository."""
    path = await _authorize(db, current_user, body.repository_id, body.repo_path)
    try:
        return await get_system_design_service().generate(
            path, detail=body.detail, use_ai=body.use_ai, refresh=body.refresh
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Repository folder was not found on disk.") from exc
    except Exception as exc:
        logger.error("System design generation failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="System design generation failed.") from exc


@router.get("", response_model=SystemDesignDiagram | None)
async def get_cached_system_design(
    repository_id: int | None = Query(default=None),
    repo_path: str | None = Query(default=None, max_length=1024),
    detail: Literal["overview", "detailed"] = Query(default="overview"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    """Return the last generated diagram for this repository, or ``null`` if none exists yet."""
    path = await _authorize(db, current_user, repository_id, repo_path)
    return get_system_design_service().get_cached(path, detail)
