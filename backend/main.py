"""FastAPI application entry point for the AI Codebase Understanding Engine."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import get_settings
from backend.core.container import get_container


# ── Lifespan ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown lifecycle."""
    # Startup: ensure configuration and data directories are ready
    settings = get_settings()
    settings.ensure_directories()

    # Pre-warm the dependency container so services are available
    container = get_container()
    _ = container.parser_service
    _ = container.graph_service

    yield  # ── application runs here ──

    # Shutdown: nothing to clean up yet


# ── App factory ─────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Codebase Understanding Engine",
    version="1.0.0",
    description=(
        "Analyse, visualise, and understand codebases through "
        "dependency graphs, code search, and AI-powered documentation."
    ),
    lifespan=lifespan,
)

# ── CORS (allow everything during development) ─────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Root health-check endpoint ──────────────────────────────────────────

@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    """Simple liveness probe."""
    return {"status": "running", "version": "1.0.0"}


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Detailed health check."""
    settings = get_settings()
    return {
        "status": "healthy",
        "version": "1.0.0",
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model,
    }


# ── Mount API routers ───────────────────────────────────────────────────

from backend.api.repository import router as repository_router
from backend.api.graph import router as graph_router
from backend.api.search import router as search_router
from backend.api.chat import router as chat_router
from backend.api.documentation import router as docs_router
from backend.api.visualization import router as viz_router
from backend.api.ai_settings import router as settings_router
from backend.api.architecture import router as architecture_router

app.include_router(repository_router)
app.include_router(graph_router)
app.include_router(search_router)
app.include_router(chat_router)
app.include_router(docs_router)
app.include_router(viz_router)
app.include_router(settings_router)
app.include_router(architecture_router)

