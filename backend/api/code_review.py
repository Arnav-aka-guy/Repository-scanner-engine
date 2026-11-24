"""Automated Code Review API endpoints (/api/review)."""

import asyncio
import logging
import subprocess
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_llm
from backend.db.database import get_db
from backend.llm.service import LLMService
from backend.security.auth import get_current_user
from backend.security.rate_limiter import AI_RATE, limiter
from backend.security.repo_auth import authorize_repository_access
from backend.services.code_review import CodeReviewReport, get_code_review_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/review", tags=["review"])


class ReviewRequest(BaseModel):
    """Payload to trigger an automated code review."""

    repo_path: str | None = Field(default=None, description="Repository root path")
    repository_id: int | None = Field(default=None, description="Optional repository database ID")
    diff_text: str | None = Field(default=None, description="Optional raw git diff or patch")
    use_llm: bool = Field(default=False, description="Whether to include LLM evaluation or run static-only")


class ReviewResponse(BaseModel):
    """Structured code review findings response."""

    files_reviewed: list[str]
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    findings: list[dict[str, Any]]
    summary: str
    deterministic_mode: bool


def _git(path: str, *args: str) -> tuple[int, str]:
    try:
        res = subprocess.run(  # noqa: S603
            ["git", *args], cwd=path, capture_output=True, text=True, timeout=10, check=False
        )
        return res.returncode, res.stdout
    except Exception:
        return 1, ""


def _working_tree_diff(path: str) -> tuple[str, str]:
    """Return (diff, description) for the repository.

    Uncommitted changes (staged and unstaged) come first. If there are none, the
    most recent commit is reviewed instead. The description says which one it was,
    or why there is nothing to review.
    """
    code, _ = _git(path, "rev-parse", "--is-inside-work-tree")
    if code != 0:
        return "", "This folder is not a git repository. Paste a diff to review it."
    code, out = _git(path, "diff", "HEAD")
    if code == 0 and out.strip():
        return out, "uncommitted changes"
    code, out = _git(path, "diff", "HEAD~1", "HEAD")
    if code == 0 and out.strip():
        return out, "the latest commit"
    code, out = _git(path, "show", "--format=", "HEAD")
    if code == 0 and out.strip():
        return out, "the latest commit"
    return "", "There are no uncommitted changes and no previous commit to compare with. Paste a diff to review it."


@router.post("/analyze", response_model=ReviewResponse)
@limiter.limit(AI_RATE)
async def analyze_code_review(
    request: Request,
    body: ReviewRequest,
    llm: LLMService = Depends(get_llm),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReviewResponse:
    """Analyze changed code via git diff or repository working tree."""
    ident = (
        body.repository_id if body.repository_id is not None else (body.repo_path.strip() if body.repo_path else None)
    )
    if not ident:
        raise HTTPException(status_code=400, detail="Either repo_path or repository_id must be provided.")
    _, path = await authorize_repository_access(db, current_user, ident)

    if body.use_llm:
        from backend.security.ai_quota import consume_ai_request

        consume_ai_request(current_user)

    diff_content = body.diff_text
    diff_source = "pasted diff"
    if not diff_content:
        diff_content, diff_source = await asyncio.to_thread(_working_tree_diff, str(path))

    if not diff_content or not diff_content.strip():
        return ReviewResponse(
            files_reviewed=[],
            total_findings=0,
            critical_count=0,
            high_count=0,
            medium_count=0,
            low_count=0,
            findings=[],
            summary=diff_source,
            deterministic_mode=not body.use_llm,
        )

    service = get_code_review_service()
    report: CodeReviewReport = await service.run_review(
        diff_text=diff_content,
        repo_path=str(path),
        use_llm=body.use_llm,
        llm_service=llm,
    )

    return ReviewResponse(
        files_reviewed=report.files_reviewed,
        total_findings=report.total_findings,
        critical_count=report.critical_count,
        high_count=report.high_count,
        medium_count=report.medium_count,
        low_count=report.low_count,
        findings=[asdict(f) for f in report.findings],
        summary=report.summary if diff_source == "pasted diff" else f"Reviewed {diff_source}. {report.summary}",
        deterministic_mode=report.deterministic_mode,
    )
