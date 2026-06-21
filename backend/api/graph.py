"""Graph construction and analysis endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from backend.graph.models import AnalysisResult, GraphData
from backend.parser.models import ParsedFile

router = APIRouter(prefix="/api/graph", tags=["graph"])


# ── Lazy service singletons ─────────────────────────────────────────────

_parser_service = None


def get_parser_service():
    """Return a lazily-initialised ParserService singleton."""
    global _parser_service  # noqa: PLW0603
    if _parser_service is None:
        from backend.parser.service import ParserService

        _parser_service = ParserService()
    return _parser_service


_graph_service = None


def get_graph_service():
    """Return a lazily-initialised GraphService singleton."""
    global _graph_service  # noqa: PLW0603
    if _graph_service is None:
        from backend.graph.service import GraphService

        _graph_service = GraphService()
    return _graph_service


# ── Helpers ──────────────────────────────────────────────────────────────


async def _parse_repository(repo_path: str) -> dict[str, ParsedFile]:
    """Validate *repo_path* and return the full parse result."""
    if not Path(repo_path).is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is not a directory: {repo_path}",
        )

    parser = get_parser_service()

    try:
        return await parser.parse_repository(repo_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc


# ── Route handlers ──────────────────────────────────────────────────────


@router.get("/dependency")
async def dependency_graph(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
) -> dict:
    """Build and return the dependency (import) graph in Cytoscape JSON format."""
    parsed_files = await _parse_repository(repo_path)
    graph_svc = get_graph_service()

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
) -> dict:
    """Build and return the call graph in Cytoscape JSON format."""
    parsed_files = await _parse_repository(repo_path)
    graph_svc = get_graph_service()

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
) -> AnalysisResult:
    """Run full graph analysis and return dead-code, cycles and complexity metrics."""
    parsed_files = await _parse_repository(repo_path)
    graph_svc = get_graph_service()

    try:
        return await graph_svc.analyze(parsed_files)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {exc}",
        ) from exc

