"""Repository scanning and file exploration endpoints."""

import asyncio
import logging
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.api.dependencies import get_embeddings, get_parser
from backend.core.models import CodeEntity, FileInfo, RepositoryInfo
from backend.embeddings.service import EmbeddingsService
from backend.parser.models import ParsedFile
from backend.parser.scanner import ScanLimitError
from backend.parser.service import ParserService
from backend.security.input_sanitizer import SanitizedRepoPath
from backend.security.path_validator import validate_file_path, validate_repository_path
from backend.security.rate_limiter import FILE_RATE, SCAN_RATE, limiter
from backend.security.repo_registry import is_repo_scanned, register_scanned_repo
from backend.storage.persistence import load_scan_jobs, save_scan_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repository", tags=["repository"])

# Persistent file-backed store for async scan jobs with in-memory cache.
_MAX_SCAN_JOBS: int = 100
_JOB_TTL_SECONDS: float = 3600.0  # 1 hour
_scan_jobs: dict[str, dict] = load_scan_jobs()


def _cleanup_scan_jobs() -> None:
    """Drop finished jobs older than 1 hour and cap total stored jobs at 100."""
    now = time.time()
    # Drop finished jobs older than 1 hour
    expired = [
        jid
        for jid, job in _scan_jobs.items()
        if job.get("status") in ("completed", "failed") and now - job.get("created_at", now) > _JOB_TTL_SECONDS
    ]
    for jid in expired:
        _scan_jobs.pop(jid, None)

    # Cap total jobs to 100 by dropping oldest finished or completed jobs
    if len(_scan_jobs) > _MAX_SCAN_JOBS:
        sorted_jobs = sorted(_scan_jobs.items(), key=lambda kv: kv[1].get("created_at", 0))
        excess = len(_scan_jobs) - _MAX_SCAN_JOBS
        for jid, _ in sorted_jobs[:excess]:
            _scan_jobs.pop(jid, None)


# ── Request / Response schemas ──────────────────────────────────────────


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
    status: str  # "pending", "scanning", "completed", "failed"
    progress: float = 0.0
    message: str = ""
    result: RepositoryInfo | None = None
    error: str | None = None


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


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("/scan", response_model=RepositoryInfo)
@limiter.limit(SCAN_RATE)
async def scan_repository(
    request: Request,
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
) -> RepositoryInfo:
    """Scan a repository: discover files, parse them and index embeddings.

    Returns aggregate repository metadata once complete.
    """
    # Sanitize then validate the path
    sanitized = SanitizedRepoPath(path=body.path)
    path = validate_repository_path(sanitized.path)

    if body.force:
        parser.invalidate_cache(str(path), clear_manifest=True)
        embeddings.invalidate_repo(str(path), clear_cache=True)

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


@router.post("/scan-github", response_model=RepositoryInfo)
@limiter.limit(SCAN_RATE)
async def scan_github_repository(
    request: Request,
    body: GitHubScanRequest,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
) -> RepositoryInfo:
    """Clone a public GitHub repository and scan it."""
    from backend.services.github_scanner import clone_github_repo

    target_dir = await asyncio.to_thread(clone_github_repo, body.url)

    try:
        repo_info: RepositoryInfo = await parser.scan_repository(str(target_dir))
        register_scanned_repo(target_dir)
    except ScanLimitError as exc:
        logger.warning("Cloned repository %s exceeded limits: %s", target_dir.name, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Repository limit exceeded: {exc.code}",
        ) from exc
    except Exception as exc:
        logger.error("Scan failed for cloned repo %s: %s", target_dir.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Repository scan failed.",
        ) from exc

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(target_dir))
        background_tasks.add_task(_index_embeddings, embeddings, parsed_files, repo_path=str(target_dir))
    except Exception as exc:
        logger.error("Indexing failed for cloned repo %s: %s", target_dir.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Repository indexing failed.",
        ) from exc

    return repo_info


async def _run_scan_job(
    job_id: str,
    path_str: str,
    parser: ParserService,
    embeddings: EmbeddingsService,
) -> None:
    """Background worker for asynchronous repository scan jobs."""
    try:
        _scan_jobs[job_id]["status"] = "scanning"
        _scan_jobs[job_id]["message"] = "Discovering and analyzing repository files..."
        _scan_jobs[job_id]["progress"] = 0.3
        save_scan_job(job_id, _scan_jobs[job_id])

        repo_info = await parser.scan_repository(path_str)
        register_scanned_repo(path_str)
        _scan_jobs[job_id]["progress"] = 0.6
        _scan_jobs[job_id]["message"] = f"Parsing {repo_info.total_files} files..."
        save_scan_job(job_id, _scan_jobs[job_id])

        parsed_files = await parser.parse_repository(path_str)
        _scan_jobs[job_id]["progress"] = 0.8
        _scan_jobs[job_id]["message"] = "Building semantic search embeddings..."
        save_scan_job(job_id, _scan_jobs[job_id])

        await _index_embeddings(embeddings, parsed_files, repo_path=path_str)

        _scan_jobs[job_id]["status"] = "completed"
        _scan_jobs[job_id]["progress"] = 1.0
        _scan_jobs[job_id]["message"] = "Scan completed successfully."
        _scan_jobs[job_id]["result"] = repo_info
        save_scan_job(job_id, _scan_jobs[job_id])

    except ScanLimitError as exc:
        _scan_jobs[job_id]["status"] = "failed"
        _scan_jobs[job_id]["error"] = f"Repository limit exceeded: {exc.code}"
        _scan_jobs[job_id]["message"] = "Scan stopped: repository limits exceeded."
        save_scan_job(job_id, _scan_jobs[job_id])
    except Exception as exc:
        logger.error("Async scan job %s failed: %s", job_id, exc, exc_info=True)
        _scan_jobs[job_id]["status"] = "failed"
        _scan_jobs[job_id]["error"] = "Repository scan failed."
        _scan_jobs[job_id]["message"] = "Scan job failed."
        save_scan_job(job_id, _scan_jobs[job_id])


@router.post("/scan/async", response_model=ScanJobResponse)
@limiter.limit(SCAN_RATE)
async def scan_repository_async(
    request: Request,
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
) -> ScanJobResponse:
    """Trigger an asynchronous repository scan job in the background.

    Returns a job_id immediately so clients can poll for status and progress.
    """
    sanitized = SanitizedRepoPath(path=body.path)
    path = validate_repository_path(sanitized.path)

    _cleanup_scan_jobs()
    register_scanned_repo(path)
    job_id = str(uuid.uuid4())
    _scan_jobs[job_id] = {
        "job_id": job_id,
        "repo_path": str(path),
        "status": "pending",
        "progress": 0.0,
        "message": "Scan job queued.",
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    save_scan_job(job_id, _scan_jobs[job_id])

    # Invalidate cache for fresh scan
    parser.invalidate_cache(str(path))
    embeddings.invalidate_repo(str(path))

    background_tasks.add_task(_run_scan_job, job_id, str(path), parser, embeddings)

    return ScanJobResponse(**_scan_jobs[job_id])


@router.get("/scan/jobs", response_model=list[ScanJobResponse])
async def list_scan_jobs(repo_path: str | None = None) -> list[ScanJobResponse]:
    """List persistent scan jobs, sorted newest first, optionally filtered by repository."""
    _cleanup_scan_jobs()
    # Re-sync in-memory cache from persistent disk store
    disk_jobs = load_scan_jobs()
    _scan_jobs.update(disk_jobs)

    jobs = list(_scan_jobs.values())
    if repo_path:
        norm = repo_path.replace("\\", "/").rstrip("/")
        jobs = [j for j in jobs if (j.get("repo_path") or "").replace("\\", "/").rstrip("/") == norm]
    jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)
    return [ScanJobResponse(**j) for j in jobs]


@router.get("/scan/jobs/{job_id}", response_model=ScanJobResponse)
async def get_scan_job_status(job_id: str) -> ScanJobResponse:
    """Poll progress and result of an asynchronous repository scan job."""
    if job_id not in _scan_jobs:
        # Check disk directly in case another worker updated it
        disk_jobs = load_scan_jobs()
        if job_id in disk_jobs:
            _scan_jobs[job_id] = disk_jobs[job_id]
        else:
            raise HTTPException(status_code=404, detail="Scan job not found.")
    return ScanJobResponse(**_scan_jobs[job_id])


@router.get("/files", response_model=list[FileInfo])
@limiter.limit(FILE_RATE)
async def list_files(
    request: Request,
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
) -> list[FileInfo]:
    """Return a flat list of all source files discovered in the repository."""
    sanitized = SanitizedRepoPath(path=repo_path)
    path = validate_repository_path(sanitized.path)

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
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
) -> FileDetail:
    """Return the raw content of a single file together with its parsed entities.

    SECURITY: The file must reside inside the declared repo_path. Path traversal,
    symlink escapes, and absolute-path escapes are all blocked by validate_file_path.
    """
    # Validate repo root first
    sanitized_repo = SanitizedRepoPath(path=repo_path)
    root = validate_repository_path(sanitized_repo.path)

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
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
) -> RepoOnboardingGuide:
    """Generate a high-level developer onboarding guide grounded in repository structure."""
    sanitized = SanitizedRepoPath(path=repo_path)
    path = validate_repository_path(sanitized.path)

    parsed_files = await parser.parse_repository(str(path))
    files = parser._scanner.get_files(str(path))

    # Identify entry points
    entry_patterns = {"main.py", "app.py", "index.ts", "index.js", "main.ts", "server.py", "App.tsx", "main.tsx"}
    def _get_path(item) -> str:
        return str(getattr(item, "path", getattr(item, "file_path", "")))

    entry_points = [
        _get_path(f) for f in files
        if any(_get_path(f).replace("\\", "/").endswith(ep) for ep in entry_patterns)
    ][:6]

    # Identify important files (files with most functions or lines)
    sorted_files = sorted(files, key=lambda f: getattr(f, "line_count", 0), reverse=True)
    important_files = [_get_path(f) for f in sorted_files[:8]]

    # Detect top languages and dependencies
    languages = set(f.language for f in files if f.language)
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


# ── Helpers ──────────────────────────────────────────────────────────────


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
