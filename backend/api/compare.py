"""Repository comparison endpoint."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.dependencies import get_parser
from backend.parser.service import ParserService
from backend.security.path_validator import validate_repository_path
from backend.services.repo_comparison import compare_repositories

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/compare", tags=["portfolio"])


class CompareRequest(BaseModel):
    """Request body for repository comparison."""

    path_a: str
    path_b: str
    name_a: str = "Repository A"
    name_b: str = "Repository B"


class RepoStatsResponse(BaseModel):
    """Stats for a single repository in comparison."""

    name: str
    path: str
    file_count: int
    total_lines: int
    function_count: int
    class_count: int
    avg_function_length: float
    languages: dict[str, int]
    health_score: float
    health_grade: str
    debt_score: float
    debt_rating: str


class CompareResponse(BaseModel):
    """Repository comparison response."""

    repo_a: RepoStatsResponse
    repo_b: RepoStatsResponse
    winner: str
    insights: list[str] = Field(default_factory=list)


@router.post("", response_model=CompareResponse)
async def compare_repos(
    body: CompareRequest,
    parser: ParserService = Depends(get_parser),
) -> CompareResponse:
    """Compare two repositories side-by-side.

    Returns health scores, tech debt ratings, and auto-generated
    insights about the differences.
    """
    path_a = validate_repository_path(body.path_a)
    path_b = validate_repository_path(body.path_b)

    try:
        parsed_a = await parser.parse_repository(str(path_a))
        parsed_b = await parser.parse_repository(str(path_b))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse error: {exc}") from exc

    result = compare_repositories(
        parsed_a,
        parsed_b,
        name_a=body.name_a,
        name_b=body.name_b,
        path_a=str(path_a),
        path_b=str(path_b),
    )

    return CompareResponse(
        repo_a=RepoStatsResponse(
            name=result.repo_a.name,
            path=result.repo_a.path,
            file_count=result.repo_a.file_count,
            total_lines=result.repo_a.total_lines,
            function_count=result.repo_a.function_count,
            class_count=result.repo_a.class_count,
            avg_function_length=result.repo_a.avg_function_length,
            languages=result.repo_a.languages,
            health_score=result.repo_a.health_score,
            health_grade=result.repo_a.health_grade,
            debt_score=result.repo_a.debt_score,
            debt_rating=result.repo_a.debt_rating,
        ),
        repo_b=RepoStatsResponse(
            name=result.repo_b.name,
            path=result.repo_b.path,
            file_count=result.repo_b.file_count,
            total_lines=result.repo_b.total_lines,
            function_count=result.repo_b.function_count,
            class_count=result.repo_b.class_count,
            avg_function_length=result.repo_b.avg_function_length,
            languages=result.repo_b.languages,
            health_score=result.repo_b.health_score,
            health_grade=result.repo_b.health_grade,
            debt_score=result.repo_b.debt_score,
            debt_rating=result.repo_b.debt_rating,
        ),
        winner=result.winner,
        insights=result.insights,
    )
