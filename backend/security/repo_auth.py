"""Centralized, deny-by-default repository authorization service.

Ensures every repository access, scan, file exploration, chat, search,
and comparison flow strictly enforces repository ownership and prevents
directory traversal, symlink escapes, and unauthorized cross-user access.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.db.models import Repository
from backend.db.repositories import get_user_repository
from backend.security.path_validator import validate_repository_path

logger = logging.getLogger(__name__)


async def authorize_repository_access(
    db: AsyncSession,
    current_user: dict[str, Any],
    repo_identifier: str | int,
    *,
    allow_unscanned: bool = False,
    require_ready: bool = False,
) -> tuple[Repository | None, Path]:
    """Authorize access to a repository by ID or path, enforcing strict user ownership.

    Args:
        db: Active database session.
        current_user: Current user dictionary from auth dependency.
        repo_identifier: Integer repository ID or filesystem repository path.
        allow_unscanned: Whether to permit access if repo has not finished scanning.
        require_ready: If True, requires repo.status to be 'READY'.

    Returns:
        Tuple of (Repository ORM instance or None in local mode, validated Path).

    Raises:
        HTTPException(400): If repository path or status is invalid.
        HTTPException(403): If access is forbidden or not owned by the user.
        HTTPException(404): If repository is not found.
    """
    settings = get_settings()
    data_dir = Path(settings.data_dir).resolve()

    # ── Authenticated Mode (Deny-by-default) ───────────────────────────
    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        repo: Repository | None = None
        target_path: Path

        # 1. Lookup by repository integer ID
        is_id = False
        repo_id: int | None = None
        if isinstance(repo_identifier, int):
            is_id = True
            repo_id = repo_identifier
        elif isinstance(repo_identifier, str) and repo_identifier.isdigit():
            is_id = True
            repo_id = int(repo_identifier)

        if is_id and repo_id is not None:
            repo = await get_user_repository(db, repo_id, user_id)
            if repo is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Repository not found or access denied.",
                )
            raw_path = repo.path or repo.source_path
            target_path = validate_repository_path(raw_path)

        # 2. Lookup by path string
        else:
            raw_input = str(repo_identifier).strip()
            if not raw_input:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Repository path must not be empty.",
                )

            # In cloud mode, reject arbitrary filesystem paths that don't match registered repos
            if getattr(settings, "app_mode", "local").lower() == "cloud":
                # Must match an owned repository
                stmt = select(Repository).where(
                    Repository.user_id == user_id,
                    (Repository.path == raw_input)
                    | (Repository.source_path == raw_input)
                    | (Repository.name == raw_input),
                )
                res = await db.execute(stmt)
                repo = res.scalars().first()
                if repo is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: Repository is not registered under your account in cloud mode.",
                    )
                target_path = validate_repository_path(repo.path or repo.source_path)

            else:
                target_path = validate_repository_path(raw_input)
                norm_path = str(target_path).replace("\\", "/").rstrip("/")

                # Query owned repositories for this user
                stmt = select(Repository).where(
                    Repository.user_id == user_id,
                    (Repository.path == norm_path) | (Repository.source_path == norm_path),
                )
                res = await db.execute(stmt)
                repo = res.scalars().first()

                # If not owned by this user, check if another user owns it
                if repo is None:
                    conflict_stmt = select(Repository).where(
                        (Repository.path == norm_path) | (Repository.source_path == norm_path)
                    )
                    conflict_res = await db.execute(conflict_stmt)
                    other_repo = conflict_res.scalars().first()
                    if other_repo and other_repo.user_id != user_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: You do not have permission to access this repository.",
                        )
                    # Deny access to unowned/unregistered paths in authenticated multi-user mode
                    if not allow_unscanned and settings.auth_enabled and settings.database_enabled:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: Repository is not registered under your account.",
                        )

        # Ensure target_path is not accessing system files or sensitive data
        if target_path == data_dir or (data_dir in target_path.parents and "cloned_repos" not in str(target_path)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to internal data directory is forbidden.",
            )

        # Status validation if repo object is resolved
        if repo is not None and require_ready and repo.status != "READY":
            if repo.status == "FAILED":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Repository scan previously failed. Please rescan the repository.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Repository is not ready for operations (status: {repo.status}).",
            )

        return repo, target_path

    # ── Local / Unauthenticated Mode ────────────────────────────────────
    target_path = validate_repository_path(str(repo_identifier))
    if target_path == data_dir or (data_dir in target_path.parents and "cloned_repos" not in str(target_path)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to internal data directory is forbidden.",
        )

    return None, target_path
