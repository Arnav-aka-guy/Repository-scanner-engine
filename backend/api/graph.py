"""Graph construction and analysis endpoints."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.api.dependencies import get_graph, get_parser
from backend.graph.models import AnalysisResult
from backend.parser.models import ParsedFile
from backend.security.path_validator import validate_repository_path

if TYPE_CHECKING:
    from backend.graph.service import GraphService
    from backend.parser.service import ParserService

logger = logging.getLogger(__name__)

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
        logger.error("Failed to parse repository %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse repository.",
        ) from exc

    try:
        return await graph_svc.get_cytoscape_data(parsed_files, "dependency")
    except Exception as exc:
        logger.error("Failed to build dependency graph for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to build dependency graph.",
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
        logger.error("Failed to parse repository %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse repository.",
        ) from exc

    try:
        return await graph_svc.get_cytoscape_data(parsed_files, "call")
    except Exception as exc:
        logger.error("Failed to build call graph for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to build call graph.",
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
        logger.error("Failed to parse repository %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse repository.",
        ) from exc

    try:
        return await graph_svc.analyze(parsed_files)
    except Exception as exc:
        logger.error("Graph analysis failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Graph analysis failed.",
        ) from exc


@router.get("/symbol")
async def symbol_graph(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> dict:
    """Build and return symbol-level graph (DEFINES, IMPORTS, CALLS, INHERITS, USES) in Cytoscape format."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        logger.error("Failed to parse repository %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse repository.",
        ) from exc

    try:
        return await graph_svc.get_symbol_graph(parsed_files)
    except Exception as exc:
        logger.error("Failed to build symbol graph for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to build symbol graph.",
        ) from exc


@router.get("/impact")
async def change_impact(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    target_file: str = Query(..., description="Target file path to analyze change impact for"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
):
    """Analyze change impact for a specific file or symbol: direct/indirect dependents and risk level."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        logger.error("Failed to parse repository %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to parse repository.",
        ) from exc

    try:
        return await graph_svc.get_change_impact(parsed_files, target_file)
    except Exception as exc:
        logger.error("Change impact analysis failed for %s: %s", target_file, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Change impact analysis failed.",
        ) from exc
