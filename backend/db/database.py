"""Async SQLAlchemy engine and session factory for PostgreSQL and SQLite.

Provides a global async engine, a session factory, and a FastAPI
dependency that yields per-request database sessions.

When ``DATABASE_ENABLED=false`` (the default) the application runs
without a relational database — vector indexes and metadata are stored
on the local filesystem only. Set ``DATABASE_ENABLED=true`` together
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


# Module-level singletons (created on first import)

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


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
                pool_pre_ping=True,
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


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the global session factory, creating it on first call."""
    global _session_factory  # noqa: PLW0603
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=_get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


def get_async_session() -> async_sessionmaker[AsyncSession]:
    """Return the global async session factory."""
    return _get_session_factory()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request.

    Commits on success, rolls back on failure, and always closes.
    """
    factory = _get_session_factory()
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def ensure_local_user() -> None:
    """Ensure the default local workspace user (id=1, email=local@localhost) exists in DB."""
    try:
        from sqlalchemy import select, update

        from backend.db.models import Repository, User
        from backend.security.auth import hash_password

        factory = _get_session_factory()
        async with factory() as db:
            local_user = await db.get(User, 1)
            if not local_user:
                stmt = select(User).where(User.email == "local@localhost")
                res = await db.execute(stmt)
                local_user = res.scalars().first()

            if not local_user:
                local_user = User(
                    id=1,
                    name="Local User",
                    email="local@localhost",
                    password_hash=hash_password("local_default_pass_123!"),
                    is_active=True,
                    token_version=1,
                )
                db.add(local_user)
                await db.commit()
                logger.info("Created default local user: id=1, email=local@localhost")

            settings = get_settings()
            if not settings.auth_enabled:
                # In local mode, reassign orphaned or legacy non-test repositories to the local user (user_id=1)
                # so workspace projects aren't hidden or blocked by old user accounts.
                stmt_adopt = (
                    update(Repository)
                    .where(
                        Repository.user_id != 1,
                        ~Repository.path.like("%pytest%"),
                    )
                    .values(user_id=1)
                )
                await db.execute(stmt_adopt)
                await db.commit()
    except Exception as exc:
        logger.debug("Failed or skipped creating default local user: %s", exc)


def _migrate_sqlite_schema(sync_conn) -> None:
    """Migrate legacy SQLite schema if needed (e.g. drop outdated UNIQUE(path) on repositories)."""
    try:
        res = sync_conn.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='repositories'"
        ).fetchone()
        if not res or not res[0]:
            return
        sql = res[0]
        if "UNIQUE (path)" in sql or "UNIQUE(path)" in sql:
            logger.info("Migrating legacy SQLite repositories table to remove stale UNIQUE(path) constraint...")
            sync_conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
            sync_conn.exec_driver_sql("""
                CREATE TABLE repositories_temp_migration (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    path VARCHAR(500) NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    total_files INTEGER DEFAULT '0',
                    total_lines INTEGER DEFAULT '0',
                    languages_json TEXT DEFAULT '{}',
                    last_scanned_at DATETIME,
                    created_at DATETIME,
                    user_id INTEGER,
                    description TEXT,
                    source_type VARCHAR(50) DEFAULT 'local' NOT NULL,
                    source_path VARCHAR(500),
                    status VARCHAR(50) DEFAULT 'CREATED' NOT NULL,
                    language VARCHAR(50),
                    file_count INTEGER DEFAULT '0' NOT NULL,
                    updated_at DATETIME,
                    CONSTRAINT fk_repositories_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            """)
            sync_conn.exec_driver_sql("""
                INSERT INTO repositories_temp_migration
                SELECT id, path, name, total_files, total_lines, languages_json, last_scanned_at, created_at, user_id, description, source_type, source_path, status, language, file_count, updated_at
                FROM repositories
            """)
            sync_conn.exec_driver_sql("DROP TABLE repositories")
            sync_conn.exec_driver_sql("ALTER TABLE repositories_temp_migration RENAME TO repositories")
            sync_conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_repositories_path ON repositories (path)")
            sync_conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_repositories_user_id ON repositories (user_id)")
            sync_conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            logger.info("SQLite repositories table migration completed successfully.")
    except Exception as exc:
        logger.warning("SQLite schema migration skipped or failed: %s", exc)


async def init_db() -> None:
    """Create all tables. Call once during application startup.

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
            if "sqlite" in settings.database_url:
                await conn.run_sync(_migrate_sqlite_schema)
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created/verified")
        await ensure_local_user()
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise


async def close_db() -> None:
    """Dispose of the engine connection pool. Call during shutdown."""
    global _engine, _session_factory  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database engine disposed")
