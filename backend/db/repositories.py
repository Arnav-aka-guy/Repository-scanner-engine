"""Repository pattern for database operations.

Provides typed CRUD methods for each ORM model, keeping data access
logic separate from business logic and API routes.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import ChatMessage, GeneratedDoc, Repository, ScanRecord

logger = logging.getLogger(__name__)


# ── Repository CRUD ─────────────────────────────────────────────────────


async def get_or_create_repository(
    db: AsyncSession, *, path: str, name: str
) -> Repository:
    """Return an existing repository by path, or create a new one."""
    stmt = select(Repository).where(Repository.path == path)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()

    if repo is None:
        repo = Repository(path=path, name=name)
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
    repo.total_lines = total_lines
    repo.languages_json = json.dumps(languages)
    repo.last_scanned_at = datetime.now(tz=timezone.utc)
    await db.flush()
    return repo


async def list_repositories(db: AsyncSession) -> list[Repository]:
    """Return all repositories ordered by last scan time."""
    stmt = select(Repository).order_by(Repository.last_scanned_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Scan Records ────────────────────────────────────────────────────────


async def create_scan_record(
    db: AsyncSession, *, repository_id: int, status: str = "pending"
) -> ScanRecord:
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
        record.completed_at = datetime.now(tz=timezone.utc)
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


async def get_chat_history(
    db: AsyncSession, repository_id: int, *, limit: int = 100
) -> list[ChatMessage]:
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
        select(GeneratedDoc)
        .where(GeneratedDoc.repository_id == repository_id)
        .where(GeneratedDoc.doc_type == doc_type)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = content
        existing.created_at = datetime.now(tz=timezone.utc)
        await db.flush()
        return existing

    doc = GeneratedDoc(
        repository_id=repository_id, doc_type=doc_type, content=content
    )
    db.add(doc)
    await db.flush()
    return doc


async def get_generated_docs(
    db: AsyncSession, repository_id: int
) -> list[GeneratedDoc]:
    """Retrieve all generated docs for a repository."""
    stmt = (
        select(GeneratedDoc)
        .where(GeneratedDoc.repository_id == repository_id)
        .order_by(GeneratedDoc.doc_type)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
