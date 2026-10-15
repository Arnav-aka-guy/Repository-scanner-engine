"""Multi-user repository management API endpoints.

Enforces strict user data isolation and the maximum 5 repositories per user limit.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_embeddings, get_parser
from backend.core.config import settings
from backend.db.database import get_db
from backend.db.models import Repository
from backend.db.repositories import (
    count_user_repositories,
    delete_user_repository,
    get_user_repository,
    list_user_repositories,
    update_repository_stats,
)
from backend.embeddings.service import EmbeddingsService
from backend.parser.scanner import ScanLimitError
from backend.parser.service import ParserService
from backend.security.auth import get_required_user
from backend.security.input_sanitizer import SanitizedRepoPath
from backend.security.path_validator import validate_repository_path
from backend.security.rate_limiter import SCAN_RATE, limiter
from backend.security.repo_registry import register_scanned_repo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repositories", tags=["repositories"])

MAX_REPOSITORIES_PER_USER = 5


# ── Schemas ─────────────────────────────────────────────────────────────


class RepositoryItem(BaseModel):
    """Detailed metadata for a single saved repository."""

    id: int
    name: str
    description: str | None = None
    source_type: str = "local"
    source_path: str
    status: str = "CREATED"
    language: str | None = None
    file_count: int = 0
    total_files: int = 0
    total_lines: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    last_scanned_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RepositoryListResponse(BaseModel):
    """Paginated or complete list of user repositories with quota metrics."""

    repositories: list[RepositoryItem]
    count: int
    max_limit: int = MAX_REPOSITORIES_PER_USER
    available_slots: int


class CreateRepositoryRequest(BaseModel):
    """Input for adding a new repository to a user account."""

    name: str = Field(..., min_length=1, max_length=200, description="Display name for the repository")
    source_path: str = Field(..., description="Filesystem directory path to repository root")
    source_type: str = Field(default="local", description="'local' or 'github'")
    description: str | None = Field(default=None, max_length=1000, description="Optional brief description")


class UpdateRepositoryRequest(BaseModel):
    """Input for updating repository metadata."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


def _to_item(repo) -> RepositoryItem:
    """Helper to convert ORM Repository to RepositoryItem schema."""
    langs = {}
    if repo.languages_json:
        try:
            langs = json.loads(repo.languages_json)
        except Exception:
            langs = {}

    return RepositoryItem(
        id=repo.id,
        name=repo.name,
        description=repo.description,
        source_type=repo.source_type or "local",
        source_path=repo.source_path or repo.path,
        status=repo.status or "CREATED",
        language=repo.language,
        file_count=repo.file_count or repo.total_files or 0,
        total_files=repo.total_files or 0,
        total_lines=repo.total_lines or 0,
        languages=langs,
        last_scanned_at=repo.last_scanned_at,
        created_at=repo.created_at,
        updated_at=repo.updated_at,
    )


# ── Route Handlers ──────────────────────────────────────────────────────


@router.get("", response_model=RepositoryListResponse)
@router.get("/", response_model=RepositoryListResponse)
async def list_repositories(
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> RepositoryListResponse:
    """Return all repositories owned by the authenticated user with quota count."""
    user_id = int(current_user["user_id"])
    repos = await list_user_repositories(db, user_id)
    items = [_to_item(r) for r in repos]
    count = len(items)
    return RepositoryListResponse(
        repositories=items,
        count=count,
        max_limit=MAX_REPOSITORIES_PER_USER,
        available_slots=max(0, MAX_REPOSITORIES_PER_USER - count),
    )


@router.post("", response_model=RepositoryItem, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=RepositoryItem, status_code=status.HTTP_201_CREATED)
async def create_repository(
    body: CreateRepositoryRequest,
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> RepositoryItem:
    """Add a new repository for the authenticated user, enforcing the 5-repository ceiling."""
    user_id = int(current_user["user_id"])

    # 1. SERVER-SIDE ENFORCEMENT: Max 5 repositories per user
    current_count = await count_user_repositories(db, user_id)
    if current_count >= MAX_REPOSITORIES_PER_USER:
        logger.warning(
            "User %d attempted to exceed limit (%d/%d repositories)",
            user_id,
            current_count,
            MAX_REPOSITORIES_PER_USER,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"You have reached the maximum limit of {MAX_REPOSITORIES_PER_USER} saved repositories. "
                "Please delete an existing repository before adding a new one."
            ),
        )

    # 2. Duplicate checking and path resolution
    repo_name = body.name.strip()
    source_type = (body.source_type or "local").lower()

    if source_type == "github":
        from backend.services.github_scanner import clone_github_repo, validate_github_url

        normalized_url, _owner, _repo_extracted = validate_github_url(body.source_path)

        # Check duplicate GitHub repo for this user
        dup_stmt = select(Repository).where(
            Repository.user_id == user_id,
            (Repository.source_path == normalized_url) | (Repository.source_path == body.source_path),
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository is already registered under your account.",
            )

        # Clone into isolated per-user directory
        user_cloned_dir = (Path(settings.data_dir) / "cloned_repos" / f"user_{user_id}").resolve()
        user_cloned_dir.mkdir(parents=True, exist_ok=True)
        try:
            cloned_path = await asyncio.to_thread(clone_github_repo, normalized_url, user_cloned_dir)
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("GitHub clone failed in create_repository: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to clone GitHub repository.",
            ) from exc

        validated_path = cloned_path
        stored_source_path = normalized_url
        stored_path = str(cloned_path).replace("\\", "/").rstrip("/")

    else:
        # Local repository path
        sanitized = SanitizedRepoPath(path=body.source_path)
        validated_path = validate_repository_path(sanitized.path)
        norm_str = str(validated_path).replace("\\", "/").rstrip("/")

        # Check duplicate path or name for this user
        dup_stmt = select(Repository).where(
            Repository.user_id == user_id,
            (Repository.path == norm_str) | (Repository.source_path == norm_str),
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository is already registered under your account.",
            )

        stored_source_path = norm_str
        stored_path = norm_str

    # 3. Create repository record in database
    from backend.db.models import Repository as RepoModel

    repo = RepoModel(
        user_id=user_id,
        name=repo_name,
        source_path=stored_source_path,
        path=stored_path,
        source_type=source_type,
        description=body.description.strip() if body.description else None,
        status="CREATED",
    )
    db.add(repo)
    await db.flush()

    # Register in registry so security validator allows reading files
    register_scanned_repo(validated_path)

    return _to_item(repo)


@router.get("/{repository_id}", response_model=RepositoryItem)
async def get_repository(
    repository_id: int,
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> RepositoryItem:
    """Get repository metadata, enforcing strict user ownership isolation."""
    user_id = int(current_user["user_id"])
    repo = await get_user_repository(db, repository_id, user_id)
    if repo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied.",
        )
    return _to_item(repo)


@router.patch("/{repository_id}", response_model=RepositoryItem)
async def update_repository(
    repository_id: int,
    body: UpdateRepositoryRequest,
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> RepositoryItem:
    """Update name or description of an owned repository."""
    user_id = int(current_user["user_id"])
    repo = await get_user_repository(db, repository_id, user_id)
    if repo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied.",
        )

    if body.name is not None and body.name.strip():
        repo.name = body.name.strip()
    if body.description is not None:
        repo.description = body.description.strip() or None

    await db.flush()
    return _to_item(repo)


@router.delete("/{repository_id}", status_code=status.HTTP_200_OK)
async def delete_repository(
    repository_id: int,
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
    embeddings: EmbeddingsService = Depends(get_embeddings),
    parser: ParserService = Depends(get_parser),
) -> dict[str, str]:
    """Delete an owned repository and purge its isolated vector index and cache."""
    user_id = int(current_user["user_id"])
    repo = await get_user_repository(db, repository_id, user_id)
    if repo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied.",
        )

    repo_path = repo.source_path or repo.path

    # Invalidate parser, embeddings, and analysis cache
    from backend.storage.persistence import invalidate_analysis_cache

    parser.invalidate_cache(repo_path, clear_manifest=True)
    embeddings.invalidate_repo(repo_path, clear_cache=True)
    invalidate_analysis_cache(repo_path)

    # Clean disk index files for this repo
    repo_id_hash = embeddings._get_repo_id(repo_path)
    disk_index_dir = Path(settings.embeddings_dir) / repo_id_hash
    if disk_index_dir.exists():
        try:
            shutil.rmtree(disk_index_dir)
            logger.info("Purged vector index directory: %s", disk_index_dir)
        except Exception as e:
            logger.warning("Could not delete vector index dir %s: %s", disk_index_dir, e)

    # Clean cloned git directory if applicable
    if (repo.source_type or "").lower() == "github" and repo.path:
        try:
            cloned_p = Path(repo.path).resolve()
            user_clone_dir = (Path(settings.data_dir) / "cloned_repos" / f"user_{user_id}").resolve()
            if user_clone_dir in cloned_p.parents or cloned_p.parent == user_clone_dir:
                from backend.services.github_scanner import _safe_rmtree

                _safe_rmtree(cloned_p)
                logger.info("Removed cloned repo directory: %s", cloned_p)
        except Exception as exc:
            logger.warning("Failed removing cloned directory: %s", exc)

    deleted = await delete_user_repository(db, repository_id, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    return {"status": "success", "message": f"Repository '{repo.name}' deleted successfully."}


@router.post("/{repository_id}/scan", response_model=RepositoryItem)
@limiter.limit(SCAN_RATE)
async def scan_user_repository(
    request: Request,
    repository_id: int,
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
) -> RepositoryItem:
    """Trigger a scan on an owned repository and update its statistics in the database."""
    user_id = int(current_user["user_id"])
    repo = await get_user_repository(db, repository_id, user_id)
    if repo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found or access denied.",
        )

    repo_path = repo.source_path or repo.path
    path = validate_repository_path(repo_path)
    register_scanned_repo(path)

    repo.status = "SCANNING"
    await db.flush()

    try:
        # Clear caches for fresh scan
        from backend.storage.persistence import invalidate_analysis_cache

        parser.invalidate_cache(str(path), clear_manifest=True)
        embeddings.invalidate_repo(str(path), clear_cache=True)
        invalidate_analysis_cache(str(path))

        repo_info = await parser.scan_repository(str(path))
        parsed_files = await parser.parse_repository(str(path))
        total_files = repo_info.total_files
        total_lines = repo_info.total_lines
        languages = repo_info.languages

        # Build isolated vector index
        await embeddings.index_repository(parsed_files, repo_path=str(path), force_reindex=True)

        await update_repository_stats(
            db,
            repo,
            total_files=total_files,
            total_lines=total_lines,
            languages=languages,
        )
        repo.status = "READY"
        await db.flush()
        return _to_item(repo)

    except ScanLimitError as exc:
        repo.status = "FAILED"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Repository scan stopped: {exc.code}",
        ) from exc
    except Exception as exc:
        logger.error("Scan failed for repository %d: %s", repository_id, exc, exc_info=True)
        repo.status = "FAILED"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Repository scanning failed. Please check the repository directory.",
        ) from exc
