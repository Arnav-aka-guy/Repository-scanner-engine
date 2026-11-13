"""Health score endpoint — computes a 0–100 transparent and explainable code quality score,
with historical trend tracking and scan-over-scan comparison.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.api.dependencies import get_graph, get_owned_repository, get_parser
from backend.graph.service import GraphService
from backend.parser.service import ParserService
from backend.services.health_history import get_health_history_service
from backend.services.health_score import compute_health_score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health-score", tags=["portfolio"])


class HealthScoreResponse(BaseModel):
    """Repository health score response with complete explainability."""

    total_score: float
    grade: str
    summary: str
    file_count: int
    total_lines: int
    dimensions: list[dict[str, Any]] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)
    scoring_formula: str = ""
    statistics: dict[str, Any] = Field(default_factory=dict)
    issue_counts: dict[str, Any] = Field(default_factory=dict)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    scoring_version: str = "2.1.0"
    baselines_version: str = "2026.1"


@router.get("", response_model=HealthScoreResponse)
async def get_health_score(
    path: Path = Depends(get_owned_repository),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> HealthScoreResponse:
    """Compute and return the health score for a repository.

    Analyses code quality across 5 dimensions: documentation,
    complexity, architecture, maintainability, and security.
    """
    from backend.storage.persistence import load_analysis_cache, save_analysis_cache

    norm_path = str(path)
    cached_data = load_analysis_cache(norm_path, "health_score")
    if cached_data is not None:
        try:
            return HealthScoreResponse(**cached_data)
        except Exception:
            pass

    try:
        parsed = await parser.parse_repository(str(path))
    except Exception as exc:
        logger.error("Failed to parse repository %s for health score: %s", path.name, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to parse repository for health score.") from exc

    # Try to get analysis for architecture scoring
    analysis = None
    try:
        analysis = await graph_svc.analyze(parsed)
    except Exception:
        logger.debug("Graph analysis unavailable for health score — skipping")

    report = compute_health_score(parsed, analysis)

    resp = HealthScoreResponse(
        total_score=report.total_score,
        grade=report.grade,
        summary=report.summary,
        file_count=report.file_count,
        total_lines=report.total_lines,
        weights=report.weights,
        scoring_formula=report.scoring_formula,
        statistics=asdict(report.statistics) if report.statistics else {},
        issue_counts=asdict(report.issue_counts) if report.issue_counts else {},
        findings=[asdict(f) for f in getattr(report, "findings", [])],
        scoring_version=getattr(report, "scoring_version", "2.1.0"),
        baselines_version=getattr(report, "baselines_version", "2026.1"),
        dimensions=[
            {
                "name": d.name,
                "key": d.key,
                "score": d.score,
                "max_score": d.max_score,
                "weight": d.weight,
                "status": d.status,
                "starting_score": d.starting_score,
                "total_penalties": d.total_penalties,
                "formula": d.formula,
                "metrics": [asdict(m) for m in d.metrics],
                "penalties": [asdict(p) for p in d.penalties],
                "top_contributors": [asdict(tc) for tc in d.top_contributors],
                "deductions": d.deductions,
            }
            for d in report.dimensions
        ],
    )
    save_analysis_cache(norm_path, "health_score", resp.model_dump())

    # Record historical snapshot
    try:
        history_svc = get_health_history_service()
        history_svc.record_snapshot(norm_path, resp.model_dump())
    except Exception as exc:
        logger.debug("Recording health history snapshot skipped: %s", exc)

    return resp


@router.get("/history")
async def get_health_history(
    path: Path = Depends(get_owned_repository),
) -> list[dict[str, Any]]:
    """Retrieve chronological health score history and metric snapshots for this repository."""
    history_svc = get_health_history_service()
    snapshots = history_svc.get_history(str(path))
    return [asdict(s) for s in snapshots]


@router.get("/compare")
async def compare_health_scans(
    path: Path = Depends(get_owned_repository),
    baseline_id: str | None = Query(default=None, description="Optional baseline snapshot ID"),
    current_id: str | None = Query(default=None, description="Optional current snapshot ID"),
) -> dict[str, Any]:
    """Compare two health snapshots, calculating score delta, resolved, and new findings."""
    history_svc = get_health_history_service()
    result = history_svc.compare_scans(str(path), baseline_id=baseline_id, current_id=current_id)
    if result is None:
        raise HTTPException(
            status_code=400,
            detail="At least 2 historical scans are required to generate comparison deltas.",
        )
    return asdict(result)
