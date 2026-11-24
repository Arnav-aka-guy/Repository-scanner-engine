"""Change Impact Analysis API endpoints (/api/impact)."""

import logging
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_graph, get_parser
from backend.db.database import get_db
from backend.graph.service import GraphService
from backend.parser.service import ParserService
from backend.security.auth import get_current_user
from backend.security.repo_auth import authorize_repository_access
from backend.services.change_impact import ChangeImpactReport, get_change_impact_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/impact", tags=["impact"])


class ImpactAnalysisRequest(BaseModel):
    """Payload to trigger change impact analysis."""

    repo_path: str | None = Field(default=None, description="Repository root path")
    repository_id: int | None = Field(default=None, description="Optional repository database ID")
    target_files: list[str] = Field(..., min_length=1, description="List of modified or target files")
    target_symbols: list[str] = Field(default_factory=list, description="Optional list of changed symbols")


class ImpactResponse(BaseModel):
    """Structured change impact response."""

    target_files: list[str]
    target_symbols: list[str]
    risk_score: int
    risk_level: str
    risk_explanation: str
    score_breakdown: dict[str, Any]
    directly_affected_modules: list[dict[str, Any]]
    indirectly_affected_modules: list[dict[str, Any]]
    api_consumers: list[str]
    shared_classes: list[str]
    callers: list[str]
    callees: list[str]
    related_test_files: list[str]
    recommended_tests: list[str]
    regression_risks: list[dict[str, Any]]
    graph_nodes: list[dict[str, Any]]
    graph_edges: list[dict[str, Any]]


def validate_target_files_exist(repo_path_str: str, target_files: list[str], parsed_files: dict[str, Any]) -> None:
    """Validate that target files exist in the repository on disk or in parsed files."""
    repo_path = Path(repo_path_str).resolve()
    for target in target_files:
        target_str = target.strip()
        if not target_str:
            continue
        target_p = Path(target_str)
        if target_p.is_absolute():
            resolved = target_p.resolve()
            exists_on_disk = resolved.is_file() and (str(resolved).startswith(str(repo_path)))
        else:
            resolved = (repo_path / target_p).resolve()
            exists_on_disk = resolved.is_file()

        if exists_on_disk:
            continue

        norm_target = target_str.replace("\\", "/").rstrip("/").lower()
        matched = False
        for k in parsed_files.keys():
            norm_k = k.replace("\\", "/").rstrip("/").lower()
            if norm_k == norm_target or norm_k.endswith("/" + norm_target):
                matched = True
                break

        if not matched:
            raise HTTPException(
                status_code=404,
                detail=f"File not found in this repository: {target_str}",
            )


@router.post("/analyze", response_model=ImpactResponse)
async def analyze_change_impact(
    body: ImpactAnalysisRequest,
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImpactResponse:
    """Analyze change impact for modified files and symbols in a repository."""
    ident = (
        body.repository_id if body.repository_id is not None else (body.repo_path.strip() if body.repo_path else None)
    )
    if not ident:
        raise HTTPException(status_code=400, detail="Either repo_path or repository_id must be provided.")
    _, path = await authorize_repository_access(db, current_user, ident)

    try:
        parsed_files = await parser.parse_repository(str(path))
        validate_target_files_exist(str(path), body.target_files, parsed_files)
        graphs = await graph_svc.build_graphs(parsed_files)
        full_graph = graphs["full"]

        service = get_change_impact_service()
        report: ChangeImpactReport = service.analyze_impact(
            graph=full_graph,
            parsed_files=parsed_files,
            target_files=body.target_files,
            target_symbols=body.target_symbols,
        )

        return ImpactResponse(
            target_files=report.target_files,
            target_symbols=report.target_symbols,
            risk_score=report.risk_score,
            risk_level=report.risk_level,
            risk_explanation=report.risk_explanation,
            score_breakdown=report.score_breakdown,
            directly_affected_modules=[asdict(m) for m in report.directly_affected_modules],
            indirectly_affected_modules=[asdict(m) for m in report.indirectly_affected_modules],
            api_consumers=report.api_consumers,
            shared_classes=report.shared_classes,
            callers=report.callers,
            callees=report.callees,
            related_test_files=report.related_test_files,
            recommended_tests=report.recommended_tests,
            regression_risks=[asdict(r) for r in report.regression_risks],
            graph_nodes=report.graph_nodes,
            graph_edges=report.graph_edges,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Change impact analysis failed for %s: %s", path, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Impact analysis failed: {exc!s}") from exc


@router.post("/export")
async def export_impact_report(
    body: ImpactAnalysisRequest,
    report_format: str = Query(default="markdown", alias="format"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Generate and export a complete Change Impact report as Markdown or JSON."""
    ident = (
        body.repository_id if body.repository_id is not None else (body.repo_path.strip() if body.repo_path else None)
    )
    if not ident:
        raise HTTPException(status_code=400, detail="Either repo_path or repository_id must be provided.")
    _, path = await authorize_repository_access(db, current_user, ident)

    try:
        parsed_files = await parser.parse_repository(str(path))
        validate_target_files_exist(str(path), body.target_files, parsed_files)
        graphs = await graph_svc.build_graphs(parsed_files)
        full_graph = graphs["full"]

        service = get_change_impact_service()
        report = service.analyze_impact(
            graph=full_graph,
            parsed_files=parsed_files,
            target_files=body.target_files,
            target_symbols=body.target_symbols,
        )

        if report_format.lower() == "markdown":
            md_content = service.generate_markdown_report(report)
            return Response(
                content=md_content,
                media_type="text/markdown",
                headers={"Content-Disposition": 'attachment; filename="change_impact_report.md"'},
            )

        # Default JSON export
        return Response(
            content=asdict(report),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="change_impact_report.json"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to export impact report: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export report.") from exc
