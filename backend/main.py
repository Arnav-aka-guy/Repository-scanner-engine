"""FastAPI application entry point for the Repository Scanner Engine.

Wires together all middleware, security, database lifecycle,
structured logging, and API routers.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

    # 3. Initialise database tables (no-op when DATABASE_ENABLED=false)
    try:
        await init_db()
    except Exception as exc:
        # Database is optional; a failed init is logged but does not crash startup.
        logger.warning("Database init skipped: %s", exc)

    # 4. Pre-warm the dependency container so services are available
    container = get_container()
    _ = container.parser_service
    _ = container.graph_service
    logger.info("Repository Scanner Engine v%s started", settings.app_version)

    yield  # ── application runs here ──

    # Shutdown
    await close_db()
    logger.info("Repository Scanner Engine shutdown complete")


# ── App factory ─────────────────────────────────────────────────────────

_settings = get_settings()

app = FastAPI(
    title="Repository Scanner Engine",
    version=_settings.app_version,
    description=(
        "AI-Powered Codebase Intelligence Platform — analyse, visualise, "
        "and understand codebases through dependency graphs, semantic search, "
        "and AI-powered documentation."
    ),
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── Middleware stack (order matters — outermost first) ──────────────────

# 1. Request logging (outermost — logs every request)
app.add_middleware(RequestLoggingMiddleware)

# 2. CORS (restricted to configured origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


# ── Static files & Frontend mounting ────────────────────────────────────

_dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if (_dist_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(_dist_dir / "assets")), name="assets")


# ── Health-check endpoints ──────────────────────────────────────────────


@app.get("/", tags=["health"])
async def root(request: Request) -> Any:
    """Simple liveness probe or frontend index for browser clients."""
    accept = request.headers.get("accept", "")
    if "text/html" in accept and (_dist_dir / "index.html").exists():
        return FileResponse(_dist_dir / "index.html")
    settings = get_settings()
    return {"status": "running", "version": settings.app_version}


@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Detailed health check with provider and model info."""
    settings = get_settings()
    return {
        "status": "healthy",
        "version": settings.app_version,
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model,
    }


# ── Mount API routers ───────────────────────────────────────────────────

from fastapi import Depends  # noqa: E402

from backend.api.ai_settings import router as settings_router  # noqa: E402
from backend.api.architecture import router as architecture_router  # noqa: E402
from backend.api.auth import router as auth_router  # noqa: E402
from backend.api.chat import router as chat_router  # noqa: E402
from backend.api.documentation import router as docs_router  # noqa: E402
from backend.api.graph import router as graph_router  # noqa: E402
from backend.api.repositories import router as repositories_router  # noqa: E402
from backend.api.repository import router as repository_router  # noqa: E402
from backend.api.search import router as search_router  # noqa: E402
from backend.api.visualization import router as viz_router  # noqa: E402
from backend.security.auth import get_current_user  # noqa: E402

# Mount public auth router (login and status endpoints require no token)
app.include_router(auth_router)
# Mount user repositories management router
app.include_router(repositories_router)

_auth_deps = [Depends(get_current_user)]

app.include_router(repository_router, dependencies=_auth_deps)
app.include_router(graph_router, dependencies=_auth_deps)
app.include_router(search_router, dependencies=_auth_deps)
app.include_router(chat_router, dependencies=_auth_deps)
app.include_router(docs_router, dependencies=_auth_deps)
app.include_router(viz_router, dependencies=_auth_deps)
app.include_router(settings_router, dependencies=_auth_deps)
app.include_router(architecture_router, dependencies=_auth_deps)

# Portfolio feature routers
from backend.api.compare import router as compare_router  # noqa: E402
from backend.api.dependency_risk import router as risk_router  # noqa: E402
from backend.api.health_score import router as health_router  # noqa: E402
from backend.api.tech_debt import router as debt_router  # noqa: E402

app.include_router(health_router, dependencies=_auth_deps)
app.include_router(debt_router, dependencies=_auth_deps)
app.include_router(risk_router, dependencies=_auth_deps)
app.include_router(compare_router, dependencies=_auth_deps)


# ── Static SPA fallback ─────────────────────────────────────────────────


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa_route(full_path: str, request: Request) -> Any:
    """Fallback handler to support client-side SPA routing."""
    clean_path = full_path.strip("/")
    if clean_path == "api" or full_path.startswith("api/") or clean_path == "health":
        raise HTTPException(status_code=404, detail="Endpoint not found")
    index_file = _dist_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Resource not found")
