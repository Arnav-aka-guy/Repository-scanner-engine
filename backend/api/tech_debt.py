"""Tech debt endpoint — analyses code smells and quantifies debt."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.api.dependencies import get_parser
from backend.parser.service import ParserService
from backend.security.path_validator import validate_repository_path
from backend.services.tech_debt import analyse_tech_debt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tech-debt", tags=["portfolio"])


class SmellItem(BaseModel):
    """A single code smell."""

    category: str
    severity: str
    file_path: str
    entity_name: str | None = None
    line: int | None = None
    message: str
    suggestion: str


class TechDebtResponse(BaseModel):
    """Tech debt analysis response."""

    total_debt_score: float
    debt_rating: str
    total_smells: int
    smells_by_category: dict[str, int] = Field(default_factory=dict)
    smells_by_severity: dict[str, int] = Field(default_factory=dict)
    suggestions: list[str] = Field(default_factory=list)
    top_offenders: list[dict[str, Any]] = Field(default_factory=list)
    all_smells: list[SmellItem] = Field(default_factory=list)


@router.get("", response_model=TechDebtResponse)
async def get_tech_debt(
    repo_path: str,
    parser: ParserService = Depends(get_parser),
) -> TechDebtResponse:
    """Analyse technical debt in a repository.

    Returns code smells categorised by severity with
    remediation suggestions.
    """
    path = validate_repository_path(repo_path)

    try:
        parsed = await parser.parse_repository(str(path))
    except Exception as exc:
        logger.error("Failed to parse repository %s for technical debt: %s", path.name, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to parse repository for technical debt analysis.") from exc

    report = analyse_tech_debt(parsed)

    return TechDebtResponse(
        total_debt_score=report.total_debt_score,
        debt_rating=report.debt_rating,
        total_smells=report.total_smells,
        smells_by_category=report.smells_by_category,
        smells_by_severity=report.smells_by_severity,
        suggestions=report.suggestions,
        top_offenders=[
            {
                "path": f.path,
                "debt_score": f.debt_score,
                "smell_count": f.smell_count,
            }
            for f in report.top_offenders
        ],
        all_smells=[
            SmellItem(
                category=s.category,
                severity=s.severity,
                file_path=s.file_path,
                entity_name=s.entity_name,
                line=s.line,
                message=s.message,
                suggestion=s.suggestion,
            )
            for s in report.all_smells
        ],
    )
