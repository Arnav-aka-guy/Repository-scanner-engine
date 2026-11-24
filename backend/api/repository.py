"""Repository scanning and file exploration endpoints."""

import asyncio
import json
import logging
import subprocess
import sys

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_embeddings, get_parser
from backend.core.models import CodeEntity, FileInfo, RepositoryInfo
from backend.db.database import get_db
from backend.embeddings.service import EmbeddingsService
from backend.parser.models import ParsedFile
from backend.parser.scanner import ScanLimitError
from backend.parser.service import ParserService
from backend.security.auth import get_current_user
from backend.security.input_sanitizer import SanitizedRepoPath
from backend.security.path_validator import validate_file_path
from backend.security.rate_limiter import FILE_RATE, SCAN_RATE, limiter
from backend.security.repo_registry import is_repo_scanned, register_scanned_repo
from backend.services.scan_worker import FINISHED_STATUSES, get_scan_job_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repository", tags=["repository"])


class ScanRequest(BaseModel):
    """Body for the repository scan endpoint."""

    path: str = Field(..., description="Absolute path to the repository root")
    force: bool = Field(default=False, description="If True, force a clean full re-scan and ignore cache")


class GitHubScanRequest(BaseModel):
    """Body for scanning a GitHub repository."""

    url: str = Field(..., description="Public GitHub repository URL (https://github.com/owner/repo)")


class ScanJobResponse(BaseModel):
    """Status of an asynchronous scan job."""

    job_id: str
    status: str  # "pending", "scanning", "indexing", "completed", "failed", "cancelled"
    progress: float = 0.0
    message: str = ""
    result: RepositoryInfo | None = None
    error: str | None = None
    warning: str | None = None


def _job_response(job: dict) -> "ScanJobResponse":
    return ScanJobResponse(
        job_id=job["job_id"],
        status=job.get("status", "pending"),
        progress=float(job.get("progress", 0.0)),
        message=job.get("message", ""),
        result=job.get("result"),
        error=job.get("error"),
        warning=job.get("warning"),
    )


def _check_job_owner(job: dict, current_user: dict) -> None:
    if current_user.get("auth") and current_user.get("user_id"):
        owner = job.get("user_id")
        if owner is not None and owner != int(current_user["user_id"]):
            raise HTTPException(status_code=404, detail="Scan job not found.")


class FileDetail(BaseModel):
    """Detailed view of a single source file including parsed entities."""

    file_path: str
    content: str
    language: str
    entities: list[CodeEntity] = Field(default_factory=list)


class RepoOnboardingGuide(BaseModel):
    """High-level repository onboarding walkthrough grounded in repository structure."""

    purpose: str
    architecture_overview: str
    entry_points: list[str] = Field(default_factory=list)
    important_files: list[str] = Field(default_factory=list)
    data_flow: str
    dependencies_summary: str
    known_issues: list[str] = Field(default_factory=list)
    starting_points: list[str] = Field(default_factory=list)


@router.post("/scan", response_model=RepositoryInfo)
@limiter.limit(SCAN_RATE)
async def scan_repository(
    request: Request,
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RepositoryInfo:
    """Scan a repository synchronously and return its metadata (used by scripts and tests).

    The app itself uses the background job endpoints. Ownership is enforced the same way.
    """
    from backend.security.repo_auth import authorize_repository_access

    sanitized = SanitizedRepoPath(path=body.path)
    _, path = await authorize_repository_access(db, current_user, sanitized.path, allow_unscanned=True)
    if get_scan_job_manager().get_active_job_for_path(str(path)) is not None:
        raise HTTPException(status_code=409, detail="A scan is already running for this repository.")

    if body.force:
        from backend.storage.persistence import invalidate_analysis_cache

        parser.invalidate_cache(str(path), clear_manifest=True)
        embeddings.invalidate_repo(str(path), clear_cache=True)
        invalidate_analysis_cache(str(path))

    try:
        repo_info: RepositoryInfo = await parser.scan_repository(str(path))
        register_scanned_repo(path)
    except ScanLimitError as exc:
        logger.warning("Repository %s exceeded limits: %s (code=%s)", path.name, exc, exc.code)
        raise HTTPException(
            status_code=400,
            detail=f"Repository limit exceeded: {exc.code}",
        ) from exc
    except Exception as exc:
        logger.error("Repository scan failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Repository scan failed.",
        ) from exc

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
        background_tasks.add_task(_index_embeddings, embeddings, parsed_files, repo_path=str(path))
    except ScanLimitError as exc:
        logger.warning("Repository %s exceeded limits during parsing: %s", path.name, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Repository limit exceeded: {exc.code}",
        ) from exc
    except Exception as exc:
        logger.error("Indexing failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Repository indexing failed.",
        ) from exc

    return repo_info


def folder_picker_available() -> bool:
    """The native folder dialog opens on the machine running the server, so only allow it
    for the single-user local app, never for a hosted or multi-user server."""
    from backend.core.config import get_settings

    settings = get_settings()
    return settings.app_mode.lower() == "local" and not settings.auth_enabled


@router.post("/browse-folder")
async def browse_folder() -> dict[str, str]:
    """Open a native OS directory selection dialog and return the selected path."""
    if not folder_picker_available():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The folder picker is only available in the local single-user app. Paste the folder path instead.",
        )

    def _open_dialog() -> str:
        try:
            script = "import tkinter as tk\nfrom tkinter import filedialog\ntry:\n    root = tk.Tk()\n    root.withdraw()\n    root.attributes('-topmost', True)\n    path = filedialog.askdirectory(title='Select Repository Folder')\n    root.destroy()\n    print(path or '')\nexcept Exception:\n    print('')\n"
            res = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, timeout=120)
            return res.stdout.strip()
        except Exception as exc:
            logger.warning("Native folder dialog subprocess failed: %s", exc)
            return ""

    folder = await asyncio.to_thread(_open_dialog)
    return {"path": folder}


async def start_scan_job(
    path: str,
    parser: ParserService,
    embeddings: EmbeddingsService,
    user_id: int | None = None,
    repo_id: int | None = None,
    github_url: str | None = None,
) -> dict:
    """Queue a full rescan through the shared ScanJobManager and return the job."""
    register_scanned_repo(path)
    return await get_scan_job_manager().create_scan_job(
        repo_path=str(path),
        parser=parser,
        embeddings=embeddings,
        user_id=user_id,
        force_reindex=True,
        repo_id=repo_id,
        github_url=github_url,
    )


@router.post("/scan/async", response_model=ScanJobResponse)
@limiter.limit(SCAN_RATE)
async def scan_repository_async(
    request: Request,
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanJobResponse:
    """Trigger an asynchronous repository scan job in the background.

    Returns a job_id immediately so clients can poll for status and progress.
    """
    from backend.security.repo_auth import authorize_repository_access

    sanitized = SanitizedRepoPath(path=body.path)
    repo, path = await authorize_repository_access(db, current_user, sanitized.path, allow_unscanned=True)
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None
    repo_id = repo.id if repo else None

    github_url = repo.source_path if repo is not None and (repo.source_type or "").lower() == "github" else None
    job = await start_scan_job(str(path), parser, embeddings, user_id=user_id, repo_id=repo_id, github_url=github_url)
    return _job_response(job)


@router.get("/scan/jobs", response_model=list[ScanJobResponse])
async def list_scan_jobs(
    repo_path: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[ScanJobResponse]:
    """List scan jobs, newest first, optionally filtered by repository."""
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None
    return [_job_response(j) for j in get_scan_job_manager().list_jobs(repo_path=repo_path, user_id=user_id)]


@router.get("/scan/jobs/{job_id}", response_model=ScanJobResponse)
async def get_scan_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> ScanJobResponse:
    """Poll progress and result of a scan job."""
    job = get_scan_job_manager().get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found.")
    _check_job_owner(job, current_user)
    return _job_response(job)


@router.post("/scan/jobs/{job_id}/cancel", response_model=ScanJobResponse)
async def cancel_scan_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> ScanJobResponse:
    """Cancel a running scan job. The running task is stopped, not just relabelled."""
    user_id = int(current_user["user_id"]) if current_user.get("auth") and current_user.get("user_id") else None
    try:
        return _job_response(await get_scan_job_manager().cancel_job(job_id, user_id=user_id))
    except KeyError:
        raise HTTPException(status_code=404, detail="Scan job not found.") from None
    except PermissionError:
        raise HTTPException(status_code=404, detail="Scan job not found.") from None


@router.get("/scan/jobs/{job_id}/events")
async def stream_scan_job_events(
    request: Request,
    job_id: str,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Stream scan progress as Server-Sent Events until the job finishes."""
    manager = get_scan_job_manager()
    first = manager.get_job(job_id)
    if first is not None:
        _check_job_owner(first, current_user)

    async def event_generator():
        last: tuple = ()
        while True:
            if await request.is_disconnected():
                break
            job = manager.get_job(job_id)
            if not job:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found', 'job_id': job_id})}\n\n"
                break
            snapshot = (job.get("status"), job.get("progress"), job.get("message"))
            if snapshot != last:
                last = snapshot
                payload = json.dumps(_job_response(job).model_dump(mode="json"))
                yield f"event: progress\ndata: {payload}\n\n"
            if job.get("status") in FINISHED_STATUSES:
                yield f"event: done\ndata: {json.dumps({'status': job.get('status')})}\n\n"
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/files", response_model=list[FileInfo])
@limiter.limit(FILE_RATE)
async def list_files(
    request: Request,
    repo_path: str | None = Query(None, description="Absolute path to the repository root"),
    repository_id: int | None = Query(None, description="Repository database ID"),
    parser: ParserService = Depends(get_parser),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FileInfo]:
    """Return a flat list of all source files discovered in the repository."""
    from backend.security.repo_auth import authorize_repository_access

    ident = (
        repository_id if repository_id is not None else (SanitizedRepoPath(path=repo_path).path if repo_path else None)
    )
    if ident is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either repo_path or repository_id must be provided.",
        )
    _, path = await authorize_repository_access(db, current_user, ident)

    if not is_repo_scanned(path):
        raise HTTPException(
            status_code=403,
            detail="Repository has not been scanned.",
        )

    try:
        files = parser._scanner.get_files(str(path))
    except Exception as exc:
        logger.error("Failed to list files for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to list repository files.",
        ) from exc

    return files


@router.get("/file/{file_path:path}", response_model=FileDetail)
@limiter.limit(FILE_RATE)
async def get_file(
    request: Request,
    file_path: str,
    repo_path: str | None = Query(None, description="Absolute path to the repository root"),
    repository_id: int | None = Query(None, description="Repository database ID"),
    parser: ParserService = Depends(get_parser),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileDetail:
    """Return the raw content of a single file together with its parsed entities.

    SECURITY: The file must reside inside the declared repo_path. Path traversal,
    symlink escapes, and absolute-path escapes are all blocked by validate_file_path.
    """
    from backend.security.repo_auth import authorize_repository_access

    ident = (
        repository_id if repository_id is not None else (SanitizedRepoPath(path=repo_path).path if repo_path else None)
    )
    if ident is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either repo_path or repository_id must be provided.",
        )
    _, root = await authorize_repository_access(db, current_user, ident)

    if not is_repo_scanned(root):
        raise HTTPException(
            status_code=403,
            detail="Repository has not been scanned.",
        )

    # Validate file path constrained to the repo root — this is the critical security boundary
    target = validate_file_path(file_path, str(root))

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.error("Cannot read file %s: %s", target.name, exc)
        raise HTTPException(status_code=500, detail="Cannot read the requested file.") from exc

    try:
        parsed: ParsedFile = await parser.parse_file(str(target))
    except Exception as exc:
        logger.error("Parse error for %s: %s", target.name, exc)
        raise HTTPException(status_code=500, detail="Failed to parse the requested file.") from exc

    # Entity extraction
    entities: list[CodeEntity] = []
    for func in parsed.functions:
        entities.append(
            CodeEntity(
                name=func.name,
                entity_type="function",
                file_path=file_path,
                start_line=func.start_line,
                end_line=func.end_line,
                docstring=func.docstring,
                source_code=func.source_code,
            )
        )
    for cls in parsed.classes:
        entities.append(
            CodeEntity(
                name=cls.name,
                entity_type="class",
                file_path=file_path,
                start_line=cls.start_line,
                end_line=cls.end_line,
                docstring=cls.docstring,
                source_code="",
            )
        )
        for method in cls.methods:
            entities.append(
                CodeEntity(
                    name=f"{cls.name}.{method.name}",
                    entity_type="method",
                    file_path=file_path,
                    start_line=method.start_line,
                    end_line=method.end_line,
                    docstring=method.docstring,
                    source_code=method.source_code,
                )
            )

    return FileDetail(
        file_path=file_path,
        content=content,
        language=parsed.language,
        entities=entities,
    )


@router.get("/onboarding", response_model=RepoOnboardingGuide)
async def get_onboarding_guide(
    repo_path: str | None = Query(default=None, description="Absolute path to the repository root"),
    repository_id: int | None = Query(default=None, description="Optional repository database ID"),
    parser: ParserService = Depends(get_parser),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RepoOnboardingGuide:
    """Generate a high-level developer onboarding guide grounded in repository structure."""
    from backend.security.repo_auth import authorize_repository_access

    ident = repository_id if repository_id is not None else (repo_path.strip() if repo_path else None)
    if not ident:
        raise HTTPException(status_code=400, detail="Either repo_path or repository_id must be provided.")
    _, path = await authorize_repository_access(db, current_user, ident)

    parsed_files = await parser.parse_repository(str(path))
    files = parser._scanner.get_files(str(path))

    # Identify entry points
    entry_patterns = {"main.py", "app.py", "index.ts", "index.js", "main.ts", "server.py", "App.tsx", "main.tsx"}

    def _get_path(item) -> str:
        return str(getattr(item, "path", getattr(item, "file_path", "")))

    entry_points = [
        _get_path(f) for f in files if any(_get_path(f).replace("\\", "/").endswith(ep) for ep in entry_patterns)
    ][:6]

    # Identify important files (files with most functions or lines)
    sorted_files = sorted(files, key=lambda f: getattr(f, "line_count", 0), reverse=True)
    important_files = [_get_path(f) for f in sorted_files[:8]]

    # Detect top languages and dependencies
    languages = {f.language for f in files if f.language}
    lang_str = ", ".join(sorted(languages)) if languages else "Multi-language"

    purpose = f"A {lang_str} codebase containing {len(files)} source files and approximately {sum(f.line_count for f in files):,} lines of code."
    arch_overview = "The repository is structured into modular components including core logic, service layers, and API/interface controllers."

    data_flow = "Requests and data initiate from primary entry points, pass through service and domain abstraction layers, and interact with data storage or external client interfaces."
    dep_summary = f"Indexed across {len(parsed_files)} parsed modules with static call graphs and dependency tracking."

    known_issues = [
        "Review modules with high coupling and circular dependencies in the Architecture Health tab.",
        "Inspect potentially unused functions in the Symbol Graph before major refactoring.",
    ]

    starting_points = entry_points if entry_points else important_files[:3]

    return RepoOnboardingGuide(
        purpose=purpose,
        architecture_overview=arch_overview,
        entry_points=entry_points,
        important_files=important_files,
        data_flow=data_flow,
        dependencies_summary=dep_summary,
        known_issues=known_issues,
        starting_points=starting_points,
    )


async def _index_embeddings(
    embeddings_service: EmbeddingsService,
    parsed_files: dict[str, ParsedFile],
    repo_path: str | None = None,
) -> int:
    """Index all parsed files into the embeddings store and return the count."""
    try:
        count: int = await embeddings_service.index_repository(parsed_files, repo_path=repo_path)
        logger.info("Indexed %d code chunks for repository: %s", count, repo_path)
        return count
    except Exception as exc:
        logger.error("Background embeddings indexing failed for %s: %s", repo_path, exc, exc_info=True)
        return 0
