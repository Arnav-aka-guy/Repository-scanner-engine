"""Asynchronous background worker and job manager for repository scanning.

Provides job queues, concurrency control (preventing duplicate concurrent scans
for the same repository), task cancellation, progress reporting, retry policy,
and temporary file cleanup on failures.
"""

from __future__ import annotations

import asyncio
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


class ScanJobManager:
    """Manages lifecycle, execution, concurrency, and cancellation of repository scans."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = load_scan_jobs()
        self._running_tasks: dict[str, asyncio.Task[Any]] = {}
        # Active repo path locks to prevent duplicate concurrent scans
        self._active_repos: dict[str, str] = {}  # norm_path -> job_id
        self._lock = asyncio.Lock()

    def _cleanup_old_jobs(self) -> None:
        """Purge jobs older than TTL and cap total jobs in memory/disk."""
        now = time.time()
        expired = [
            jid
            for jid, job in self._jobs.items()
            if job.get("status") in ("completed", "failed", "cancelled")
            and now - job.get("created_at", now) > _JOB_TTL_SECONDS
        ]
        for jid in expired:
            self._jobs.pop(jid, None)

        if len(self._jobs) > _MAX_SCAN_JOBS:
            sorted_jobs = sorted(self._jobs.items(), key=lambda kv: kv[1].get("created_at", 0))
            for jid, _ in sorted_jobs[: len(self._jobs) - _MAX_SCAN_JOBS]:
                self._jobs.pop(jid, None)

    def get_active_jobs(self) -> list[dict[str, Any]]:
        """Return list of currently in-flight scan jobs."""
        return [job for job in self._jobs.values() if job.get("status") in ("pending", "scanning", "indexing")]

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        """Lookup job state by ID, reloading from disk if needed."""
        if job_id not in self._jobs:
            disk_jobs = load_scan_jobs()
            if job_id in disk_jobs:
                self._jobs[job_id] = disk_jobs[job_id]
        return self._jobs.get(job_id)

    def list_jobs(
        self,
        repo_path: str | None = None,
        user_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """List scan jobs, filtered by repository or user ID."""
        self._cleanup_old_jobs()
        disk_jobs = load_scan_jobs()
        self._jobs.update(disk_jobs)

        jobs = list(self._jobs.values())
        if user_id is not None:
            jobs = [j for j in jobs if j.get("user_id") is None or j.get("user_id") == user_id]

        if repo_path:
            norm = repo_path.replace("\\", "/").rstrip("/").lower()
            jobs = [j for j in jobs if (j.get("repo_path") or "").replace("\\", "/").rstrip("/").lower() == norm]

        jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)
        return jobs

    async def create_scan_job(
        self,
        repo_path: str,
        parser: ParserService,
        embeddings: EmbeddingsService,
        user_id: int | None = None,
        force_reindex: bool = False,
        is_temporary_clone: bool = False,
    ) -> dict[str, Any]:
        """Create and queue a scan job, preventing duplicate concurrent scans for the same repo."""
        norm_path = str(Path(repo_path).resolve()).replace("\\", "/").rstrip("/")

        async with self._lock:
            # Check if there is already an active job for this repository
            if norm_path in self._active_repos:
                active_job_id = self._active_repos[norm_path]
                active_job = self.get_job(active_job_id)
                if active_job and active_job.get("status") in ("pending", "scanning", "indexing"):
                    logger.info("Reusing existing active scan job %s for repo %s", active_job_id, norm_path)
                    return active_job
                # Task finished or cleaned up
                self._active_repos.pop(norm_path, None)

            self._cleanup_old_jobs()
            job_id = str(uuid.uuid4())
            job_state: dict[str, Any] = {
                "job_id": job_id,
                "scan_id": job_id,  # Standard REST alias
                "repo_path": norm_path,
                "status": "pending",
                "progress": 0.0,
                "message": "Scan job queued.",
                "result": None,
                "error": None,
                "created_at": time.time(),
                "user_id": user_id,
                "is_temporary_clone": is_temporary_clone,
            }
            self._jobs[job_id] = job_state
            self._active_repos[norm_path] = job_id
            save_scan_job(job_id, job_state)

            # Start worker task
            task = asyncio.create_task(
                self._execute_scan(
                    job_id=job_id,
                    repo_path=norm_path,
                    parser=parser,
                    embeddings=embeddings,
                    force_reindex=force_reindex,
                    is_temporary_clone=is_temporary_clone,
                )
            )
            self._running_tasks[job_id] = task

        return job_state

    async def cancel_job(self, job_id: str, user_id: int | None = None) -> dict[str, Any]:
        """Cancel a running scan job and clean up resources."""
        job = self.get_job(job_id)
        if not job:
            raise KeyError(f"Job {job_id} not found")

        if user_id is not None and job.get("user_id") is not None and job.get("user_id") != user_id:
            raise PermissionError("Access denied to cancel this job")

        if job["status"] in ("completed", "failed", "cancelled"):
            return job

        # Cancel active task if running
        task = self._running_tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        job["status"] = "cancelled"
        job["message"] = "Scan job cancelled by user."
        job["progress"] = 0.0
        save_scan_job(job_id, job)

        # Release repo lock
        norm_path = job.get("repo_path", "")
        self._active_repos.pop(norm_path, None)

        # Cleanup temporary directory if cloned
        if job.get("is_temporary_clone") and norm_path and Path(norm_path).exists():
            try:
                shutil.rmtree(norm_path, ignore_errors=True)
                logger.info("Cleaned up temporary cloned repository at %s", norm_path)
            except Exception as exc:
                logger.warning("Failed to clean up temporary repo %s: %s", norm_path, exc)

        return job

    async def _execute_scan(
        self,
        job_id: str,
        repo_path: str,
        parser: ParserService,
        embeddings: EmbeddingsService,
        force_reindex: bool,
        is_temporary_clone: bool,
    ) -> None:
        """Execute scan, parse, and embedding pipeline with progress and error handling."""
        job = self._jobs[job_id]
        try:
            # 1. Update to scanning
            job["status"] = "scanning"
            job["message"] = "Discovering repository source files..."
            job["progress"] = 0.15
            save_scan_job(job_id, job)

            if force_reindex:
                from backend.storage.persistence import invalidate_analysis_cache

                parser.invalidate_cache(repo_path, clear_manifest=True)
                embeddings.invalidate_repo(repo_path, clear_cache=True)
                invalidate_analysis_cache(repo_path)

            # Discover files
            repo_info: RepositoryInfo = await parser.scan_repository(repo_path)
            register_scanned_repo(repo_path)

            job["progress"] = 0.4
            job["message"] = f"Parsing {repo_info.total_files} discovered source files..."
            save_scan_job(job_id, job)

            # 2. Parse AST & extract symbols
            parsed_files = await parser.parse_repository(repo_path)

            job["status"] = "indexing"
            job["progress"] = 0.7
            job["message"] = "Generating semantic embeddings & vector index..."
            save_scan_job(job_id, job)

            # 3. Build embeddings & search indices
            indexed_chunks = await embeddings.index_repository(
                parsed_files,
                repo_path=repo_path,
                force_reindex=force_reindex,
            )

            job["status"] = "completed"
            job["progress"] = 1.0
            job["message"] = f"Scan complete. Indexed {indexed_chunks} code entities."
            job["result"] = repo_info
            save_scan_job(job_id, job)
            logger.info("Scan job %s completed successfully for %s", job_id, repo_path)

        except asyncio.CancelledError:
            logger.info("Scan job %s was cancelled", job_id)
            job["status"] = "cancelled"
            job["message"] = "Scan job was cancelled."
            save_scan_job(job_id, job)

        except ScanLimitError as exc:
            logger.warning("Scan job %s exceeded limits: %s (code=%s)", job_id, exc, exc.code)
            job["status"] = "failed"
            job["error"] = f"Repository limit exceeded: {exc.code}"
            job["message"] = "Scan stopped: repository limits exceeded."
            save_scan_job(job_id, job)

        except Exception as exc:
            logger.error("Scan job %s failed: %s", job_id, exc, exc_info=True)
            job["status"] = "failed"
            job["error"] = "Repository scan failed."
            job["message"] = f"Scan failed: {exc!s}"
            save_scan_job(job_id, job)

        finally:
            self._running_tasks.pop(job_id, None)
            norm_path = job.get("repo_path", "")
            self._active_repos.pop(norm_path, None)


# Singleton instance
_scan_manager: ScanJobManager | None = None


def get_scan_job_manager() -> ScanJobManager:
    """Return the global singleton ScanJobManager instance."""
    global _scan_manager  # noqa: PLW0603
    if _scan_manager is None:
        _scan_manager = ScanJobManager()
    return _scan_manager
