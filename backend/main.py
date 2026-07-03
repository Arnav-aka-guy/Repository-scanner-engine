"""FastAPI application entry point for the Antigravity Engine.

Wires together all middleware, security, database lifecycle, 
structured logging, and API routers.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.core.config import get_settings
from backend.core.container import get_container
from backend.core.logging import setup_logging
from backend.db.database import close_db, init_db
from backend.middleware.request_logging import RequestLoggingMiddleware
from backend.security.rate_limiter import limiter

logger = logging.getLogger(__name__)


# ── Lifespan ────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown lifecycle."""
    # 1. Initialise structured logging
    setup_logging(level="INFO")

    # 2. Ensure configuration and data directories are ready
    settings = get_settings()
    settings.ensure_directories()

    # 3. Initialise database tables
    try:
        await init_db()
        logger.info("Database initialised")
    except Exception as exc:
        logger.warning("Database init skipped (not critical): %s", exc)

    # 4. Pre-warm the dependency container so services are available
    container = get_container()
    _ = container.parser_service
    _ = container.graph_service
    logger.info("Antigravity Engine v2.0.0 started")

    yield  # ── application runs here ──

    # Shutdown
    await close_db()
    logger.info("Antigravity Engine shutdown complete")


# ── App factory ─────────────────────────────────────────────────────────

app = FastAPI(
    title="Antigravity Engine",
    version="2.0.0",
    description=(
        "AI-Powered Codebase Intelligence Platform — analyse, visualise, "
        "and understand codebases through dependency graphs, semantic search, "
        "and AI-powered documentation."
    ),
    lifespan=lifespan,
)

# ── Middleware stack (order matters — outermost first) ──────────────────

# 1. Request logging (outermost — logs every request)
app.add_middleware(RequestLoggingMiddleware)

# 2. CORS (restricted to known development origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Health-check endpoints ──────────────────────────────────────────────


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    """Simple liveness probe."""
    return {"status": "running", "version": "2.0.0"}


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Detailed health check with provider and model info."""
    settings = get_settings()
    return {
        "status": "healthy",
        "version": "2.0.0",
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model,
    }


# ── Mount API routers ───────────────────────────────────────────────────

from backend.api.repository import router as repository_router  # noqa: E402
from backend.api.graph import router as graph_router  # noqa: E402
from backend.api.search import router as search_router  # noqa: E402
from backend.api.chat import router as chat_router  # noqa: E402
from backend.api.documentation import router as docs_router  # noqa: E402
from backend.api.visualization import router as viz_router  # noqa: E402
from backend.api.ai_settings import router as settings_router  # noqa: E402
from backend.api.architecture import router as architecture_router  # noqa: E402

app.include_router(repository_router)
app.include_router(graph_router)
app.include_router(search_router)
app.include_router(chat_router)
app.include_router(docs_router)
app.include_router(viz_router)
app.include_router(settings_router)
app.include_router(architecture_router)

# Portfolio feature routers
from backend.api.health_score import router as health_router  # noqa: E402
from backend.api.tech_debt import router as debt_router  # noqa: E402
from backend.api.dependency_risk import router as risk_router  # noqa: E402
from backend.api.compare import router as compare_router  # noqa: E402

app.include_router(health_router)
app.include_router(debt_router)
app.include_router(risk_router)
app.include_router(compare_router)


