"""Health score endpoint — computes a 0–100 code quality score."""

from __future__ import annotations

import logging
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
    """Repository health score response."""

    total_score: float
    grade: str
    summary: str
    file_count: int
    total_lines: int
    dimensions: list[dict[str, Any]] = Field(default_factory=list)


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
        dimensions=[
            {
                "name": d.name,
                "score": d.score,
                "max_score": d.max_score,
                "deductions": d.deductions,
            }
            for d in report.dimensions
        ],
    )
