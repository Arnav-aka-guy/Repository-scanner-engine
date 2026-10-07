"""Health score endpoint — computes a 0–100 transparent and explainable code quality score."""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.dependencies import get_graph, get_parser
from backend.graph.service import GraphService
from backend.parser.service import ParserService
from backend.security.path_validator import validate_repository_path
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


@router.get("", response_model=HealthScoreResponse)
async def get_health_score(
    repo_path: str,
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> HealthScoreResponse:
    """Compute and return the health score for a repository.

    Analyses code quality across 5 dimensions: documentation,
    complexity, architecture, maintainability, and security.
    """
    path = validate_repository_path(repo_path)

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

    return HealthScoreResponse(
        total_score=report.total_score,
        grade=report.grade,
        summary=report.summary,
        file_count=report.file_count,
        total_lines=report.total_lines,
        weights=report.weights,
        scoring_formula=report.scoring_formula,
        statistics=asdict(report.statistics) if report.statistics else {},
        issue_counts=asdict(report.issue_counts) if report.issue_counts else {},
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
