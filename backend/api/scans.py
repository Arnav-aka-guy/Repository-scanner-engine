import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_embeddings, get_parser
from backend.core.models import RepositoryInfo
from backend.db.database import get_db
from backend.embeddings.service import EmbeddingsService
from backend.parser.service import ParserService
from backend.security.auth import get_current_user
from backend.security.input_sanitizer import SanitizedRepoPath
from backend.security.rate_limiter import SCAN_RATE, limiter
from backend.security.repo_auth import authorize_repository_access
from backend.services.scan_worker import get_scan_job_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scans", tags=["scans"])


class CreateScanRequest(BaseModel):
    """Payload to trigger an asynchronous repository scan."""

    path: str = Field(..., description="Absolute path or registered repo path")
    force: bool = Field(default=False, description="Whether to invalidate cache and force full rescan")


class ScanResponse(BaseModel):
    """Standard scan job response."""

    job_id: str
    scan_id: str
    status: str
    progress: float = 0.0
    message: str = ""
    repo_path: str = ""
    result: RepositoryInfo | None = None
    error: str | None = None
    created_at: float = 0.0


@router.post("", response_model=ScanResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(SCAN_RATE)
async def create_scan(
    request: Request,
    body: CreateScanRequest,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanResponse:
    """Trigger an asynchronous repository scan job.

    Enforces authorization, concurrency control, and returns 202 Accepted.
    """
    sanitized = SanitizedRepoPath(path=body.path)
    _, path = await authorize_repository_access(db, current_user, sanitized.path, allow_unscanned=True)

    manager = get_scan_job_manager()
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None

    job = await manager.create_scan_job(
        repo_path=str(path),
        parser=parser,
        embeddings=embeddings,
        user_id=user_id,
        force_reindex=body.force,
    )
    return ScanResponse(**job)


@router.get("", response_model=list[ScanResponse])
async def list_scans(
    repo_path: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[ScanResponse]:
    """List recent scan jobs, optionally filtered by repository."""
    manager = get_scan_job_manager()
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None
    jobs = manager.list_jobs(repo_path=repo_path, user_id=user_id)
    return [ScanResponse(**j) for j in jobs]


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> ScanResponse:
    """Retrieve full details of a specific scan job."""
    manager = get_scan_job_manager()
    job = manager.get_job(scan_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found.")

    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        if job.get("user_id") is not None and job.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Scan job not found.")

    return ScanResponse(**job)


@router.get("/{scan_id}/status")
async def get_scan_status(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Lightweight polling endpoint returning progress, status, and message."""
    manager = get_scan_job_manager()
    job = manager.get_job(scan_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found.")

    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        if job.get("user_id") is not None and job.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Scan job not found.")

    return {
        "scan_id": scan_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0.0),
        "message": job.get("message", ""),
        "error": job.get("error"),
    }


@router.post("/{scan_id}/cancel", response_model=ScanResponse)
async def cancel_scan(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> ScanResponse:
    """Cancel an active repository scan job."""
    manager = get_scan_job_manager()
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None

    try:
        updated = await manager.cancel_job(scan_id, user_id=user_id)
        return ScanResponse(**updated)
    except KeyError:
        raise HTTPException(status_code=404, detail="Scan job not found.") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied to cancel this job.") from None


@router.get("/{scan_id}/events")
async def stream_scan_events(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Stream real-time Server-Sent Events (SSE) for scan job progress and status."""
    manager = get_scan_job_manager()
    job = manager.get_job(scan_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found.")

    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        if job.get("user_id") is not None and job.get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="Scan job not found.")

    async def _event_generator():
        last_progress = -1.0
        last_status = ""
        while True:
            cur_job = manager.get_job(scan_id)
            if not cur_job:
                break

            status_val = cur_job.get("status", "unknown")
            progress_val = cur_job.get("progress", 0.0)

            if (
                status_val != last_status
                or abs(progress_val - last_progress) >= 0.05
                or status_val in ("completed", "failed", "cancelled")
            ):
                last_status = status_val
                last_progress = progress_val
                payload = json.dumps(
                    {
                        "scan_id": scan_id,
                        "job_id": scan_id,
                        "status": status_val,
                        "progress": progress_val,
                        "message": cur_job.get("message", ""),
                        "error": cur_job.get("error"),
                    }
                )
                yield f"event: progress\ndata: {payload}\n\n"

            if status_val in ("completed", "failed", "cancelled"):
                yield f"event: done\ndata: {json.dumps({'status': status_val})}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
