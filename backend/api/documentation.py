"""Documentation generation and export endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.config import get_settings

router = APIRouter(prefix="/api/docs", tags=["documentation"])


def get_docs_service():
    """Return the global DocumentationService singleton."""
    from backend.core.container import get_container
    return get_container().documentation_service


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
async def generate_docs(body: GenerateRequest) -> GenerateResponse:
    """Generate documentation for the entire repository.

    Produces either Markdown or HTML output depending on the requested format
    and writes the result to the configured docs directory.
    """
    if body.format not in _VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{body.format}'. Accepted: {sorted(_VALID_FORMATS)}",
        )

    repo_path = Path(body.repo_path)
    if not repo_path.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is not a directory: {body.repo_path}",
        )

    docs_svc = get_docs_service()
    settings = get_settings()

    try:
        docs: dict = await docs_svc.generate_full_docs(str(repo_path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Documentation generation failed: {exc}",
        ) from exc

    output_dir = Path(settings.docs_dir) / repo_path.name
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        if body.format == "markdown":
            await docs_svc.export_markdown(docs, repo_path.name)
        else:
            await docs_svc.export_html(docs, repo_path.name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {exc}",
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

    path = Path(repo_path)
    if not path.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is not a directory: {repo_path}",
        )

    docs_svc = get_docs_service()
    settings = get_settings()

    try:
        docs: dict = await docs_svc.generate_full_docs(repo_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Documentation generation failed: {exc}",
        ) from exc

    output_dir = Path(settings.docs_dir) / path.name
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        if format == "markdown":
            await docs_svc.export_markdown(docs, path.name)
        else:
            await docs_svc.export_html(docs, path.name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {exc}",
        ) from exc

    return GenerateResponse(
        repo_path=repo_path,
        format=format,
        modules=len(docs.get("modules", docs)),
        output_dir=str(output_dir),
        docs=docs,
    )
