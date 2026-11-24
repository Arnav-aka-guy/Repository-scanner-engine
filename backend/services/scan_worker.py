"""Background scan jobs: the one place where repository scans run.

Every scan entry point (the saved-repository API, the path-based API and the
/api/scans REST API) goes through ScanJobManager so that:

* only one scan per repository runs at a time (a second request reuses it),
* cancelling a job really stops the running task,
* the saved Repository row always moves to READY, FAILED or CANCELLED,
* jobs interrupted by a restart are reported as failed instead of hanging,
* GitHub repositories are pulled again before a rescan.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from backend.core.models import RepositoryInfo
from backend.parser.scanner import ScanLimitError
from backend.security.repo_registry import register_scanned_repo
from backend.storage.persistence import load_scan_jobs, save_scan_job

if TYPE_CHECKING:
    from backend.embeddings.service import EmbeddingsService
    from backend.parser.service import ParserService

logger = logging.getLogger(__name__)

_MAX_SCAN_JOBS = 100
_JOB_TTL_SECONDS = 3600.0  # 1 hour
ACTIVE_STATUSES = ("pending", "scanning", "indexing")
FINISHED_STATUSES = ("completed", "failed", "cancelled")


def normalize_repo_path(repo_path: str) -> str:
    """Return the canonical form used to key jobs by repository."""
    return str(Path(repo_path).resolve()).replace("\\", "/").rstrip("/")


def describe_limit_error(exc: ScanLimitError) -> str:
    """Turn a ScanLimitError into a sentence a user can act on."""
    code = getattr(exc.code, "value", exc.code)
    if code in ("max_files", "repository_too_large"):
        if exc.limit is not None:
            return f"Scan stopped: the repository has more than {exc.limit} files (MAX_FILES)."
        return "Scan stopped: the repository has too many files (MAX_FILES)."
    if code == "max_depth":
        if exc.limit is not None:
            return f"Scan stopped: folders are nested deeper than {exc.limit} levels (MAX_DIRECTORY_DEPTH)."
        return "Scan stopped: folders are nested too deeply (MAX_DIRECTORY_DEPTH)."
    if code == "max_size":
        return "Scan stopped: a file is larger than the size limit (MAX_FILE_SIZE_BYTES)."
    return f"Scan stopped: repository limits exceeded ({code})."


async def set_repository_status(
    repo_id: int | None,
    repo_path: str,
    status: str,
    repo_info: RepositoryInfo | None = None,
) -> None:
    """Update the saved Repository row for a scan, if there is one.

    Never raises: scans must still work in filesystem-only mode.
    """
    try:
        from sqlalchemy import select

        from backend.db.database import get_async_session
        from backend.db.models import Repository
        from backend.db.repositories import update_repository_stats

        factory = get_async_session()
        async with factory() as db:
            target: Repository | None = None
            if repo_id:
                target = await db.get(Repository, repo_id)
            if target is None:
                norm = repo_path.replace("\\", "/").rstrip("/")
                res = await db.execute(
                    select(Repository).where((Repository.path == norm) | (Repository.source_path == norm))
                )
                target = res.scalars().first()
            if target is None:
                return
            target.status = status
            if status == "READY" and repo_info is not None:
                await update_repository_stats(
                    db,
                    target,
                    total_files=repo_info.total_files,
                    total_lines=repo_info.total_lines,
                    languages=repo_info.languages,
                )
            await db.commit()
    except Exception as exc:  # pragma: no cover - depends on DB availability
        logger.debug("Repository status update skipped for %s: %s", repo_path, exc)


async def reset_interrupted_repositories() -> int:
    """Mark repositories left in SCANNING by a crash or restart as FAILED.

    Without this, the UI shows "Scanning…" forever and disables the Scan button.
    Returns the number of rows changed.
    """
    try:
        from sqlalchemy import update

        from backend.db.database import get_async_session
        from backend.db.models import Repository

        factory = get_async_session()
        async with factory() as db:
            result = await db.execute(update(Repository).where(Repository.status == "SCANNING").values(status="FAILED"))
            await db.commit()
            changed = int(result.rowcount or 0)
            if changed:
                logger.warning("Marked %d repositories interrupted by a restart as FAILED", changed)
            return changed
    except Exception as exc:  # pragma: no cover - depends on DB availability
        logger.debug("Interrupted repository reset skipped: %s", exc)
        return 0


class ScanJobManager:
    """Runs scans as asyncio tasks with per-repository locking and real cancellation."""

    def __init__(self) -> None:
        # Recovery of interrupted jobs happens once, here, when the process starts.
        self._jobs: dict[str, dict[str, Any]] = load_scan_jobs(recover_interrupted=True)
        self._running_tasks: dict[str, asyncio.Task[Any]] = {}
        self._active_repos: dict[str, str] = {}  # normalized path -> job_id
        self._lock = asyncio.Lock()

    # ── Queries ────────────────────────────────────────────────────────────

    def _cleanup_old_jobs(self) -> None:
        now = time.time()
        expired = [
            jid
            for jid, job in self._jobs.items()
            if job.get("status") in FINISHED_STATUSES and now - job.get("created_at", now) > _JOB_TTL_SECONDS
        ]
        for jid in expired:
            self._jobs.pop(jid, None)
        if len(self._jobs) > _MAX_SCAN_JOBS:
            finished = sorted(
                (kv for kv in self._jobs.items() if kv[1].get("status") in FINISHED_STATUSES),
                key=lambda kv: kv[1].get("created_at", 0),
            )
            for jid, _ in finished[: len(self._jobs) - _MAX_SCAN_JOBS]:
                self._jobs.pop(jid, None)

    def _merge_disk_jobs(self) -> None:
        """Pick up jobs written by another worker without touching live in-memory jobs."""
        for jid, job in load_scan_jobs(recover_interrupted=False).items():
            if jid not in self._jobs:
                self._jobs[jid] = job

    def get_active_jobs(self) -> list[dict[str, Any]]:
        return [job for job in self._jobs.values() if job.get("status") in ACTIVE_STATUSES]

    def get_active_job_for_path(self, repo_path: str) -> dict[str, Any] | None:
        job_id = self._active_repos.get(normalize_repo_path(repo_path))
        if not job_id:
            return None
        job = self._jobs.get(job_id)
        if job and job.get("status") in ACTIVE_STATUSES:
            return job
        return None

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        if job_id not in self._jobs:
            self._merge_disk_jobs()
        return self._jobs.get(job_id)

    def list_jobs(self, repo_path: str | None = None, user_id: int | None = None) -> list[dict[str, Any]]:
        self._cleanup_old_jobs()
        self._merge_disk_jobs()
        jobs = list(self._jobs.values())
        if user_id is not None:
            jobs = [j for j in jobs if j.get("user_id") is None or j.get("user_id") == user_id]
        if repo_path:
            norm = repo_path.replace("\\", "/").rstrip("/").lower()
            jobs = [j for j in jobs if (j.get("repo_path") or "").replace("\\", "/").rstrip("/").lower() == norm]
        jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)
        return jobs

    # ── Commands ───────────────────────────────────────────────────────────

    async def create_scan_job(
        self,
        repo_path: str,
        parser: ParserService,
        embeddings: EmbeddingsService,
        user_id: int | None = None,
        force_reindex: bool = False,
        is_temporary_clone: bool = False,
        repo_id: int | None = None,
        github_url: str | None = None,
    ) -> dict[str, Any]:
        """Queue a scan, or return the scan already running for this repository."""
        norm_path = normalize_repo_path(repo_path)

        async with self._lock:
            existing = self.get_active_job_for_path(norm_path)
            if existing is not None:
                logger.info("Reusing active scan job %s for %s", existing["job_id"], norm_path)
                return existing
            self._active_repos.pop(norm_path, None)

            self._cleanup_old_jobs()
            job_id = str(uuid.uuid4())
            job: dict[str, Any] = {
                "job_id": job_id,
                "scan_id": job_id,
                "repo_path": norm_path,
                "status": "pending",
                "progress": 0.0,
                "message": "Scan queued.",
                "result": None,
                "error": None,
                "warning": None,
                "created_at": time.time(),
                "user_id": user_id,
                "repo_id": repo_id,
                "is_temporary_clone": is_temporary_clone,
            }
            self._jobs[job_id] = job
            self._active_repos[norm_path] = job_id
            save_scan_job(job_id, job)
            # Mark the saved repository as scanning before the task can possibly finish.
            await set_repository_status(repo_id, norm_path, "SCANNING")

            self._running_tasks[job_id] = asyncio.create_task(
                self._execute_scan(
                    job_id=job_id,
                    repo_path=norm_path,
                    parser=parser,
                    embeddings=embeddings,
                    force_reindex=force_reindex,
                    is_temporary_clone=is_temporary_clone,
                    repo_id=repo_id,
                    github_url=github_url,
                )
            )
        return job

    async def cancel_job(self, job_id: str, user_id: int | None = None) -> dict[str, Any]:
        """Stop a running scan. Safe to call on finished jobs."""
        job = self.get_job(job_id)
        if not job:
            raise KeyError(f"Job {job_id} not found")
        if user_id is not None and job.get("user_id") is not None and job.get("user_id") != user_id:
            raise PermissionError("Access denied to cancel this job")
        if job["status"] in FINISHED_STATUSES:
            return job

        task = self._running_tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            with contextlib.suppress(TimeoutError, asyncio.CancelledError, Exception):
                await asyncio.wait_for(asyncio.shield(task), timeout=5)

        # The task's own CancelledError handler normally sets these; cover the
        # case where no task was running (for example a job loaded from disk).
        if job["status"] not in FINISHED_STATUSES:
            job["status"] = "cancelled"
            job["message"] = "Scan cancelled."
            save_scan_job(job_id, job)
            await set_repository_status(job.get("repo_id"), job.get("repo_path", ""), "CANCELLED")
        self._active_repos.pop(job.get("repo_path", ""), None)
        return job

    async def cancel_jobs_for_path(self, repo_path: str) -> None:
        """Cancel any running scan for a repository (used before deleting it)."""
        job = self.get_active_job_for_path(repo_path)
        if job is not None:
            await self.cancel_job(job["job_id"])

    # ── Worker ─────────────────────────────────────────────────────────────

    def _update(self, job_id: str, **fields: Any) -> None:
        job = self._jobs[job_id]
        job.update(fields)
        save_scan_job(job_id, job)

    async def _execute_scan(
        self,
        job_id: str,
        repo_path: str,
        parser: ParserService,
        embeddings: EmbeddingsService,
        force_reindex: bool,
        is_temporary_clone: bool,
        repo_id: int | None = None,
        github_url: str | None = None,
    ) -> None:
        job = self._jobs[job_id]
        try:
            if github_url:
                self._update(
                    job_id, status="scanning", progress=0.05, message="Fetching the latest commits from GitHub…"
                )
                from backend.services.github_scanner import clone_github_repo

                await asyncio.to_thread(clone_github_repo, github_url, Path(repo_path).parent)

            self._update(job_id, status="scanning", progress=0.15, message="Finding source files…")

            if force_reindex:
                from backend.storage.persistence import invalidate_analysis_cache

                parser.invalidate_cache(repo_path, clear_manifest=True)
                embeddings.invalidate_repo(repo_path, clear_cache=True)
                invalidate_analysis_cache(repo_path)

            repo_info: RepositoryInfo = await parser.scan_repository(repo_path)
            register_scanned_repo(repo_path)
            self._update(job_id, progress=0.4, message=f"Parsing {repo_info.total_files} files…")

            parsed_files = await parser.parse_repository(repo_path)
            self._update(job_id, status="indexing", progress=0.7, message="Building the search index…")

            warning: str | None = None
            try:
                indexed = await embeddings.index_repository(
                    parsed_files, repo_path=repo_path, force_reindex=force_reindex
                )
                done_message = f"Scan complete. Indexed {indexed} code entities."
            except Exception as exc:
                # Structure, graph and health still work without the search index.
                logger.error("Search indexing failed for %s: %s", repo_path, exc, exc_info=True)
                warning = (
                    "Search index could not be built, so Search and the Assistant may not work for this repository."
                )
                done_message = "Scan complete, but the search index could not be built."

            self._update(
                job_id,
                status="completed",
                progress=1.0,
                message=done_message,
                warning=warning,
                result=repo_info,
            )
            await set_repository_status(repo_id, repo_path, "READY", repo_info=repo_info)
            logger.info("Scan job %s completed for %s", job_id, repo_path)

        except asyncio.CancelledError:
            logger.info("Scan job %s was cancelled", job_id)
            self._update(job_id, status="cancelled", message="Scan cancelled.")
            await set_repository_status(repo_id, repo_path, "CANCELLED")

        except ScanLimitError as exc:
            logger.warning("Scan job %s exceeded limits: %s", job_id, exc)
            self._update(
                job_id,
                status="failed",
                error=f"Repository limit exceeded: {getattr(exc.code, 'value', exc.code)}",
                message=describe_limit_error(exc),
            )
            await set_repository_status(repo_id, repo_path, "FAILED")

        except Exception as exc:
            logger.error("Scan job %s failed: %s", job_id, exc, exc_info=True)
            detail = getattr(exc, "detail", None) or str(exc) or "Repository scan failed."
            self._update(job_id, status="failed", error=str(detail), message=f"Scan failed: {detail}")
            await set_repository_status(repo_id, repo_path, "FAILED")

        finally:
            self._running_tasks.pop(job_id, None)
            if self._active_repos.get(job.get("repo_path", "")) == job_id:
                self._active_repos.pop(job.get("repo_path", ""), None)
            if is_temporary_clone and job.get("status") in ("failed", "cancelled"):
                shutil.rmtree(repo_path, ignore_errors=True)


_scan_manager: ScanJobManager | None = None


def get_scan_job_manager() -> ScanJobManager:
    """Return the process-wide ScanJobManager."""
    global _scan_manager  # noqa: PLW0603
    if _scan_manager is None:
        _scan_manager = ScanJobManager()
    return _scan_manager
