"""Dependency risk analysis endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.security.path_validator import validate_repository_path
from backend.services.dependency_risk import analyse_dependency_risk

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dependency-risk", tags=["portfolio"])


class DependencyItem(BaseModel):
    """A single dependency risk item."""

    name: str
    version_spec: str
    source: str
    risk_level: str
    issues: list[str] = Field(default_factory=list)


class DependencyRiskResponse(BaseModel):
    """Dependency risk analysis response."""

    total_dependencies: int
    python_deps: int
    node_deps: int
    pinning_score: float
    risk_summary: dict[str, int] = Field(default_factory=dict)
    suggestions: list[str] = Field(default_factory=list)
    dependencies: list[DependencyItem] = Field(default_factory=list)


@router.get("", response_model=DependencyRiskResponse)
async def get_dependency_risk(repo_path: str) -> DependencyRiskResponse:
    """Analyse dependency risk for a repository.

    Checks requirements.txt and package.json for pinning quality,
    known risky packages, and overall dependency health.
    """
    path = validate_repository_path(repo_path)

    report = analyse_dependency_risk(str(path))

    return DependencyRiskResponse(
        total_dependencies=report.total_dependencies,
        python_deps=report.python_deps,
        node_deps=report.node_deps,
        pinning_score=report.pinning_score,
        risk_summary=report.risk_summary,
        suggestions=report.suggestions,
        dependencies=[
            DependencyItem(
                name=d.name,
                version_spec=d.version_spec,
                source=d.source,
                risk_level=d.risk_level,
                issues=d.issues,
            )
            for d in report.dependencies
        ],
    )
