"""Architecture analysis API endpoints."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core.container import get_container
from backend.graph.architecture_analyzer import ArchitectureAnalyzer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/architecture", tags=["architecture"])

_analyzer = ArchitectureAnalyzer()


class ArchitectureRequest(BaseModel):
    """Request body for architecture analysis."""
    repo_path: str


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
async def get_architecture_report(request: ArchitectureRequest) -> ArchitectureReportResponse:
    """Run full architecture analysis on a repository."""
    container = get_container()
    parser = container.parser_service
    graph_svc = container.graph_service

    # Parse the repository
    parsed_files = await parser.parse_repository(request.repo_path)

    # Build the dependency graph to get nodes and edges
    graph_data = await graph_svc.get_dependency_graph(parsed_files)

    # Run architecture analysis
    report = _analyzer.analyze(
        parsed_files=parsed_files,
        graph_nodes=graph_data.nodes,
        graph_edges=graph_data.edges,
    )

    return ArchitectureReportResponse(**report.to_dict())


@router.get("/layers")
async def get_architecture_layers(repo_path: str) -> dict[str, Any]:
    """Quick endpoint to just get detected layers."""
    container = get_container()
    parser = container.parser_service

    parsed_files = await parser.parse_repository(repo_path)
    file_paths = list(parsed_files.keys())

    layers = _analyzer._detect_layers(file_paths)

    return {
        "layers": layers,
        "total_layers": len(layers),
        "total_files": len(file_paths),
    }
