"""Documentation generation and export endpoints."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.api.dependencies import get_docs
from backend.core.config import get_settings
from backend.security.path_validator import validate_repository_path

if TYPE_CHECKING:
    from backend.documentation.service import DocumentationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/docs", tags=["documentation"])


# ── Request / Response schemas ──────────────────────────────────────────

_VALID_FORMATS = {"markdown", "html"}


class GenerateRequest(BaseModel):
    """Body for the documentation generate endpoint."""

    repo_path: str = Field(..., description="Absolute path to the repository root")
    format: str = Field(
        default="markdown",
        description="Output format: 'markdown' or 'html'",
    )


class GenerateResponse(BaseModel):
    """Result of a documentation generation run."""

    repo_path: str
    format: str
    modules: int = 0
    output_dir: str = ""
    docs: dict = Field(default_factory=dict)


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("/generate", response_model=GenerateResponse)
async def generate_docs(
    body: GenerateRequest,
    docs_svc: DocumentationService = Depends(get_docs),
) -> GenerateResponse:
    """Generate documentation for the entire repository.

    Produces either Markdown or HTML output depending on the requested format
    and writes the result to the configured docs directory.
    """
    if body.format not in _VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{body.format}'. Accepted: {sorted(_VALID_FORMATS)}",
        )

    path = validate_repository_path(body.repo_path)
    settings = get_settings()

    try:
        docs: dict = await docs_svc.generate_full_docs(str(path))
    except Exception as exc:
        logger.error("Documentation generation failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Documentation generation failed.",
        ) from exc

    output_dir = Path(settings.docs_dir) / path.name
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        if body.format == "markdown":
            await docs_svc.export_markdown(docs, path.name)
        else:
            await docs_svc.export_html(docs, path.name)
    except Exception as exc:
        logger.error("Documentation export failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Documentation export failed.",
        ) from exc

    return GenerateResponse(
        repo_path=body.repo_path,
        format=body.format,
        modules=len(docs.get("modules", docs)),
        output_dir=str(output_dir),
        docs=docs,
    )


@router.get("/export", response_model=GenerateResponse)
async def export_docs(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    format: str = Query(
        default="markdown",
        description="Output format: 'markdown' or 'html'",
    ),
    docs_svc: DocumentationService = Depends(get_docs),
) -> GenerateResponse:
    """Generate and export documentation, returning the doc tree.

    Convenience endpoint identical in behaviour to ``POST /generate`` but
    accessible via GET with query parameters.
    """
    if format not in _VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{format}'. Accepted: {sorted(_VALID_FORMATS)}",
        )

    path = validate_repository_path(repo_path)
    settings = get_settings()

    try:
        docs: dict = await docs_svc.generate_full_docs(str(path))
    except Exception as exc:
        logger.error("Documentation generation failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Documentation generation failed.",
        ) from exc

    output_dir = Path(settings.docs_dir) / path.name
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        if format == "markdown":
            await docs_svc.export_markdown(docs, path.name)
        else:
            await docs_svc.export_html(docs, path.name)
    except Exception as exc:
        logger.error("Documentation export failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Documentation export failed.",
        ) from exc

    return GenerateResponse(
        repo_path=repo_path,
        format=format,
        modules=len(docs.get("modules", docs)),
        output_dir=str(output_dir),
        docs=docs,
    )
