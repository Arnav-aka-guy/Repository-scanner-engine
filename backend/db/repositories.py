"""Repository pattern for database operations.

Provides typed CRUD methods for each ORM model, keeping data access
logic separate from business logic and API routes.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import ChatMessage, GeneratedDoc, Repository, ScanRecord, User

logger = logging.getLogger(__name__)


# ── User CRUD ───────────────────────────────────────────────────────────


async def create_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password_hash: str,
) -> User:
    """Create a new user account."""
    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        password_hash=password_hash,
    )
    db.add(user)
    await db.flush()
    logger.info("Created user account: %s (%s)", user.name, user.email)
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Look up a user account by email address (case-insensitive)."""
    stmt = select(User).where(func.lower(User.email) == email.strip().lower())
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """Look up a user account by primary key ID."""
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── User-scoped Repository CRUD ─────────────────────────────────────────


async def count_user_repositories(db: AsyncSession, user_id: int) -> int:
    """Count how many repositories are currently owned by a user."""
    stmt = select(func.count(Repository.id)).where(Repository.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one() or 0


async def list_user_repositories(db: AsyncSession, user_id: int) -> list[Repository]:
    """Return all repositories owned by a user, ordered newest first."""
    stmt = select(Repository).where(Repository.user_id == user_id).order_by(Repository.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_user_repository(db: AsyncSession, repository_id: int, user_id: int) -> Repository | None:
    """Retrieve a repository ensuring strict user ownership isolation."""
    stmt = select(Repository).where(
        Repository.id == repository_id,
        Repository.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_user_repository(
    db: AsyncSession,
    *,
    user_id: int,
    name: str,
    source_path: str,
    source_type: str = "local",
    description: str | None = None,
) -> Repository:
    """Create a new repository owned by user_id."""
    normalized_path = source_path.replace("\\", "/").rstrip("/")
    repo = Repository(
        user_id=user_id,
        name=name.strip(),
        source_path=normalized_path,
        path=normalized_path,
        source_type=source_type,
        description=description.strip() if description else None,
        status="CREATED",
    )
    db.add(repo)
    await db.flush()
    logger.info("Created repository %s for user %d at %s", repo.name, user_id, normalized_path)
    return repo


async def delete_user_repository(db: AsyncSession, repository_id: int, user_id: int) -> bool:
    """Delete a user-owned repository and cascade all associated data."""
    repo = await get_user_repository(db, repository_id, user_id)
    if not repo:
        return False
    await db.delete(repo)
    await db.flush()
    logger.info("Deleted repository %d for user %d", repository_id, user_id)
    return True


# ── Legacy / General Repository CRUD ────────────────────────────────────


async def get_or_create_repository(db: AsyncSession, *, path: str, name: str) -> Repository:
    """Return an existing repository by path, or create a new one."""
    stmt = select(Repository).where(Repository.path == path)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()

    if repo is None:
        repo = Repository(path=path, source_path=path, name=name)
        db.add(repo)
        await db.flush()
        logger.info("Created repository record: %s (%s)", name, path)

    return repo


async def update_repository_stats(
    db: AsyncSession,
    repo: Repository,
    *,
    total_files: int,
    total_lines: int,
    languages: dict[str, int],
) -> Repository:
    """Update scan statistics for a repository."""
    repo.total_files = total_files
    repo.file_count = total_files
    repo.total_lines = total_lines
    repo.languages_json = json.dumps(languages)
    if languages:
        repo.language = max(languages.items(), key=lambda kv: kv[1])[0]
    repo.last_scanned_at = datetime.now(tz=UTC)
    repo.status = "READY"
    await db.flush()
    return repo


async def list_repositories(db: AsyncSession) -> list[Repository]:
    """Return all repositories ordered by last scan time."""
    stmt = select(Repository).order_by(Repository.last_scanned_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Scan Records ────────────────────────────────────────────────────────


async def create_scan_record(db: AsyncSession, *, repository_id: int, status: str = "pending") -> ScanRecord:
    """Create a new scan record."""
    record = ScanRecord(repository_id=repository_id, status=status)
    db.add(record)
    await db.flush()
    return record


async def update_scan_record(
    db: AsyncSession,
    record: ScanRecord,
    *,
    status: str | None = None,
    files_scanned: int | None = None,
    files_indexed: int | None = None,
    duration_ms: float | None = None,
    error_message: str | None = None,
) -> ScanRecord:
    """Update a scan record with new status/metrics."""
    if status is not None:
        record.status = status
    if files_scanned is not None:
        record.files_scanned = files_scanned
    if files_indexed is not None:
        record.files_indexed = files_indexed
    if duration_ms is not None:
        record.duration_ms = duration_ms
    if error_message is not None:
        record.error_message = error_message
    if status in ("completed", "failed"):
        record.completed_at = datetime.now(tz=UTC)
    await db.flush()
    return record


# ── Chat Messages ───────────────────────────────────────────────────────


async def save_chat_message(
    db: AsyncSession,
    *,
    repository_id: int,
    role: str,
    content: str,
) -> ChatMessage:
    """Save a chat message to the database."""
    msg = ChatMessage(repository_id=repository_id, role=role, content=content)
    db.add(msg)
    await db.flush()
    return msg


async def get_chat_history(db: AsyncSession, repository_id: int, *, limit: int = 100) -> list[ChatMessage]:
    """Retrieve recent chat messages for a repository."""
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.repository_id == repository_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Generated Docs ──────────────────────────────────────────────────────


async def save_generated_doc(
    db: AsyncSession,
    *,
    repository_id: int,
    doc_type: str,
    content: str,
) -> GeneratedDoc:
    """Save or update a generated documentation entry."""
    stmt = (
        select(GeneratedDoc).where(GeneratedDoc.repository_id == repository_id).where(GeneratedDoc.doc_type == doc_type)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = content
        existing.created_at = datetime.now(tz=UTC)
        await db.flush()
        return existing

    doc = GeneratedDoc(repository_id=repository_id, doc_type=doc_type, content=content)
    db.add(doc)
    await db.flush()
    return doc


async def get_generated_docs(db: AsyncSession, repository_id: int) -> list[GeneratedDoc]:
    """Retrieve all generated docs for a repository."""
    stmt = select(GeneratedDoc).where(GeneratedDoc.repository_id == repository_id).order_by(GeneratedDoc.doc_type)
    result = await db.execute(stmt)
    return list(result.scalars().all())
