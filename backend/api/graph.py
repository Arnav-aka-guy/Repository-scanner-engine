"""Graph construction and analysis endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.api.dependencies import get_graph, get_parser
from backend.graph.models import AnalysisResult, GraphData
from backend.parser.models import ParsedFile
from backend.security.path_validator import validate_repository_path

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.graph.service import GraphService
    from backend.parser.service import ParserService

router = APIRouter(prefix="/api/graph", tags=["graph"])


# ── Route handlers ──────────────────────────────────────────────────────


@router.get("/dependency")
async def dependency_graph(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> dict:
    """Build and return the dependency (import) graph in Cytoscape JSON format."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc

    try:
        return await graph_svc.get_cytoscape_data(parsed_files, "dependency")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build dependency graph: {exc}",
        ) from exc


@router.get("/call")
async def call_graph(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> dict:
    """Build and return the call graph in Cytoscape JSON format."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc

    try:
        return await graph_svc.get_cytoscape_data(parsed_files, "call")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build call graph: {exc}",
        ) from exc


@router.get("/analysis", response_model=AnalysisResult)
async def analysis(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> AnalysisResult:
    """Run full graph analysis and return dead-code, cycles and complexity metrics."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc

    try:
        return await graph_svc.analyze(parsed_files)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {exc}",
        ) from exc
