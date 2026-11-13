"""Automated Code Review API endpoints (/api/review)."""

import asyncio
import logging
import subprocess
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_llm
from backend.db.database import get_db
from backend.llm.service import LLMService
from backend.security.auth import get_current_user
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


@router.post("/analyze", response_model=ReviewResponse)
async def analyze_code_review(
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

    diff_content = body.diff_text
    # If no diff is passed, try to extract git diff against HEAD in the repository
    if not diff_content:

        def _get_git_diff() -> str:
            try:
                res = subprocess.run(
                    ["git", "diff", "HEAD~1"],
                    cwd=str(path),
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if res.returncode == 0 and res.stdout.strip():
                    return res.stdout
                # Fallback to unstaged working tree diff
                res_unstaged = subprocess.run(
                    ["git", "diff"],
                    cwd=str(path),
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                return res_unstaged.stdout if res_unstaged.returncode == 0 else ""
            except Exception:
                return ""

        diff_content = await asyncio.to_thread(_get_git_diff)

    if not diff_content or not diff_content.strip():
        # Provide clean empty report if repository has no active diffs
        return ReviewResponse(
            files_reviewed=[],
            total_findings=0,
            critical_count=0,
            high_count=0,
            medium_count=0,
            low_count=0,
            findings=[],
            summary="No git diff provided or detected in the repository working directory.",
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
        summary=report.summary,
        deterministic_mode=report.deterministic_mode,
    )
