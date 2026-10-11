"""Health, liveness, and readiness probes for Antigravity Engine."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from backend.core.config import get_settings

logger = logging.getLogger(__name__)


async def check_liveness() -> dict[str, str]:
    """Fast liveness check: confirms process is alive and responsive."""
    return {"status": "alive"}


async def check_readiness() -> tuple[bool, dict[str, Any]]:
    """Readiness probe verifying subsystems: storage, database, embeddings."""
    settings = get_settings()
    components: dict[str, dict[str, Any]] = {}
    is_ready = True

    # 1. Storage write readiness
    try:
        data_path = Path(settings.data_dir)
        data_path.mkdir(parents=True, exist_ok=True)
        probe_file = data_path / ".readiness_probe.tmp"
        probe_file.write_text("ok", encoding="utf-8")
        probe_file.unlink(missing_ok=True)
        components["storage"] = {"status": "ok", "path": str(data_path)}
    except Exception as exc:
        components["storage"] = {"status": "error", "error": str(exc)}
        is_ready = False

    # 2. Database readiness (if enabled)
    if settings.database_enabled:
        try:
            from sqlalchemy import text

            from backend.db.database import get_async_session

            factory = get_async_session()
            async with factory() as session:
                await session.execute(text("SELECT 1"))
            components["database"] = {"status": "ok"}
        except Exception as exc:
            components["database"] = {"status": "error", "error": str(exc)}
            is_ready = False
    else:
        components["database"] = {"status": "disabled"}

    # 3. Embeddings directory & model configuration readiness
    try:
        emb_path = Path(settings.embeddings_dir)
        emb_path.mkdir(parents=True, exist_ok=True)
        components["embeddings"] = {
            "status": "ok",
            "model": settings.embedding_model,
        }
    except Exception as exc:
        components["embeddings"] = {"status": "error", "error": str(exc)}
        is_ready = False

    status_str = "ready" if is_ready else "unhealthy"
    return is_ready, {
        "status": status_str,
        "version": settings.app_version,
        "components": components,
    }
