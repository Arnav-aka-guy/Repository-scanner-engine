"""SQLAlchemy ORM models for persistent storage.

Stores user accounts, repository metadata, scan history, chat conversations,
and generated documentation.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(tz=UTC)


class User(Base):
    """User account entity for multi-user authentication and repository ownership."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    repositories: Mapped[list[Repository]] = relationship(
        "Repository", back_populates="user", cascade="all, delete-orphan"
    )


class Repository(Base):
    """A saved repository owned by a user."""

    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), default="local")
    source_path: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="CREATED")
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    total_lines: Mapped[int] = mapped_column(Integer, default=0)
    languages_json: Mapped[str] = mapped_column(Text, default="{}")
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    user: Mapped[User | None] = relationship("User", back_populates="repositories")
    scans: Mapped[list[ScanRecord]] = relationship(
        "ScanRecord", back_populates="repository", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[list[ChatMessage]] = relationship(
        "ChatMessage", back_populates="repository", cascade="all, delete-orphan"
    )
    generated_docs: Mapped[list[GeneratedDoc]] = relationship(
        "GeneratedDoc", back_populates="repository", cascade="all, delete-orphan"
    )


class ScanRecord(Base):
    """Record of a single scan operation."""

    __tablename__ = "scan_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "scanning", "indexing", "completed", "failed", name="scan_status"),
        default="pending",
    )
    files_scanned: Mapped[int] = mapped_column(Integer, default=0)
    files_indexed: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    repository: Mapped[Repository] = relationship("Repository", back_populates="scans")


class ChatMessage(Base):
    """A single chat message in a conversation."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Enum("user", "assistant", name="message_role"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    repository: Mapped[Repository] = relationship("Repository", back_populates="chat_messages")


class GeneratedDoc(Base):
    """A generated documentation entry."""

    __tablename__ = "generated_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False
    )
    doc_type: Mapped[str] = mapped_column(
        Enum("overview", "module", "architecture", "api_reference", "dependency_map", name="doc_type"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    repository: Mapped[Repository] = relationship("Repository", back_populates="generated_docs")
