"""Architecture analysis API endpoints."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_owned_repository
from backend.core.container import get_container
from backend.db.database import get_db
from backend.graph.architecture_analyzer import ArchitectureAnalyzer
from backend.security.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/architecture", tags=["architecture"])


class ArchitectureRequest(BaseModel):
    """Request body for architecture analysis."""

    repo_path: str | None = Field(default=None, description="Absolute path to repository")
    repository_id: int | None = Field(default=None, description="Optional repository database ID")


class ArchitectureReportResponse(BaseModel):
    """Full architecture analysis response."""

    score: int = 0
    layers: dict[str, list[str]] = Field(default_factory=dict)
    circular_dependencies: list[list[str]] = Field(default_factory=list)
    dead_code: list[dict[str, Any]] = Field(default_factory=list)
    violations: list[dict[str, Any]] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    problems: list[str] = Field(default_factory=list)
    summary: str = ""
    stats: dict[str, Any] = Field(default_factory=dict)


@router.post("/report", response_model=ArchitectureReportResponse)
async def get_architecture_report(
    request: ArchitectureRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ArchitectureReportResponse:
    """Run full architecture analysis on a repository."""
    from backend.security.repo_auth import authorize_repository_access

    ident = (
        request.repository_id
        if request.repository_id is not None
        else (request.repo_path.strip() if request.repo_path else None)
    )
    if not ident:
        raise HTTPException(status_code=400, detail="Either repo_path or repository_id must be provided.")
    _, path = await authorize_repository_access(db, current_user, ident)

    container = get_container()
    parser = container.parser_service
    graph_svc = container.graph_service

    # Parse the repository
    parsed_files = await parser.parse_repository(str(path))

    # Build the dependency graph to get nodes and edges
    graph_data = await graph_svc.get_dependency_graph(parsed_files)

    # Run architecture analysis
    analyzer = ArchitectureAnalyzer()
    report = analyzer.analyze(
        parsed_files=parsed_files,
        graph_nodes=graph_data.nodes,
        graph_edges=graph_data.edges,
    )

    return ArchitectureReportResponse(**report.to_dict())


@router.get("/layers")
async def get_architecture_layers(
    path: Path = Depends(get_owned_repository),
) -> dict[str, Any]:
    """Quick endpoint to just get detected layers."""
    container = get_container()
    parser = container.parser_service

    parsed_files = await parser.parse_repository(str(path))
    file_paths = list(parsed_files.keys())

    analyzer = ArchitectureAnalyzer()
    layers = analyzer._detect_layers(file_paths)

    return {
        "layers": layers,
        "total_layers": len(layers),
        "total_files": len(file_paths),
    }
