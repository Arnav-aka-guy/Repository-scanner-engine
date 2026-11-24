"""Download a shareable HTML report for a repository."""

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_graph, get_parser
from backend.db.database import get_db
from backend.graph.service import GraphService
from backend.parser.service import ParserService
from backend.security.auth import get_current_user
from backend.security.rate_limiter import AI_RATE, limiter
from backend.security.repo_auth import authorize_repository_access
from backend.services.report import build_report_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/report", tags=["report"])


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.") or "repository"
    return f"{cleaned[:60]}-report.html"


@router.get("", response_class=HTMLResponse)
@limiter.limit(AI_RATE)
async def download_report(
    request: Request,
    repository_id: int | None = Query(default=None),
    repo_path: str | None = Query(default=None),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> HTMLResponse:
    """Return a self-contained HTML report (health, languages, top issues, import loops)."""
    ident = repository_id if repository_id is not None else (repo_path or "").strip() or None
    if ident is None:
        raise HTTPException(status_code=400, detail="Either repository_id or repo_path must be provided.")
    repo, path = await authorize_repository_access(db, current_user, ident)

    from backend.api.health_score import get_health_score

    health = (await get_health_score(path=path, parser=parser, graph_svc=graph_svc)).model_dump()

    analysis: dict[str, Any] | None = None
    try:
        parsed = await parser.parse_repository(str(path))
        analysis = (await graph_svc.analyze(parsed)).model_dump()
    except Exception as exc:
        logger.warning("Report: graph analysis unavailable for %s: %s", path.name, exc)

    if repo is not None and (repo.total_files or 0) > 0:
        name = repo.name
        source = repo.source_path or repo.path or path.name
        total_files = int(repo.total_files or 0)
        total_lines = int(repo.total_lines or 0)
        try:
            languages = json.loads(repo.languages_json or "{}")
        except ValueError:
            languages = {}
    else:
        info = await parser.scan_repository(str(path))
        name = repo.name if repo is not None else info.name
        source = (repo.source_path if repo is not None else None) or path.name
        total_files, total_lines, languages = info.total_files, info.total_lines, dict(info.languages)

    # Local folders: show only the folder name, never the full server path.
    if not str(source).startswith(("http://", "https://")):
        source = path.name

    body = build_report_html(
        repo_name=name,
        repo_root=path,
        source=str(source),
        total_files=total_files,
        total_lines=total_lines,
        languages=languages,
        health=health,
        analysis=analysis,
    )
    return HTMLResponse(
        content=body,
        headers={"Content-Disposition": f'attachment; filename="{_safe_filename(name)}"'},
    )
