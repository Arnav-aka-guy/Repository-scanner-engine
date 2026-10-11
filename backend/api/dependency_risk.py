"""Dependency risk analysis endpoint."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.api.dependencies import get_owned_repository
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
async def get_dependency_risk(path: Path = Depends(get_owned_repository)) -> DependencyRiskResponse:
    """Analyse dependency risk for a repository.

    Checks requirements.txt and package.json for pinning quality,
    known risky packages, and overall dependency health.
    """

    from backend.storage.persistence import load_analysis_cache, save_analysis_cache

    norm_path = str(path)
    cached_data = load_analysis_cache(norm_path, "dependency_risk")
    if cached_data is not None:
        try:
            return DependencyRiskResponse(**cached_data)
        except Exception:
            pass

    report = analyse_dependency_risk(str(path))

    resp = DependencyRiskResponse(
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
    save_analysis_cache(norm_path, "dependency_risk", resp.model_dump())
    return resp
