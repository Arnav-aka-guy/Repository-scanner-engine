"""Async SQLAlchemy engine and session factory for PostgreSQL.

Provides a global async engine, a session factory, and a FastAPI
dependency that yields per-request database sessions.

When ``DATABASE_ENABLED=false`` (the default) the application runs
without a relational database — vector indexes and metadata are stored
on the local filesystem only.  Set ``DATABASE_ENABLED=true`` together
with a reachable ``DATABASE_URL`` to enable full persistence.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.core.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# ── Module-level singletons (created on first import) ───────────────────

_engine = None
_session_factory = None


def _get_engine():
    """Return the global async engine, creating it on first call."""
    global _engine  # noqa: PLW0603
    if _engine is None:
        settings = get_settings()
        if "sqlite" in settings.database_url:
            _engine = create_async_engine(
                settings.database_url,
                echo=False,
                connect_args={"check_same_thread": False},
            )
        else:
            _engine = create_async_engine(
                settings.database_url,
                echo=False,
                pool_size=5,
                max_overflow=10,
                pool_pre_ping=True,
            )
        # Log only the host/db portion — never the credentials.
        db_host = settings.database_url.split("@")[-1]
        logger.info("Database engine created: %s", db_host)
    return _engine


def _get_session_factory():
    """Return the global session factory, creating it on first call."""
    global _session_factory  # noqa: PLW0603
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=_get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request.

    Commits on success, rolls back on failure, and always closes.
    """
    factory = _get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables.  Call once during application startup.

    No-ops when ``DATABASE_ENABLED=false`` so the application starts
    correctly without a Postgres connection.
    """
    settings = get_settings()
    if not settings.database_enabled and "sqlite" not in settings.database_url:
        logger.info("Database disabled (DATABASE_ENABLED=false) — skipping table creation.")
        return

    engine = _get_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created/verified")
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise


async def close_db() -> None:
    """Dispose of the engine connection pool.  Call during shutdown."""
    global _engine, _session_factory  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database engine disposed")
