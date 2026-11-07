"""System design diagram service: facts -> draft -> (optional Groq enrichment) -> cache."""

from __future__ import annotations

import asyncio
import contextlib
import datetime
import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from backend.services.system_design.builder import build_diagram
from backend.services.system_design.enricher import TextGenerator, enrich_with_llm
from backend.services.system_design.facts import collect_repo_facts
from backend.services.system_design.mermaid import to_mermaid
from backend.services.system_design.schema import sanitize_diagram

logger = logging.getLogger(__name__)

CACHE_VERSION = 1
LLM_TIMEOUT_SECONDS = 90
DETAIL_LEVELS = ("overview", "detailed")


class SystemDesignService:
    """Generates and caches system design diagrams for repositories.

    Args:
        cache_dir: Folder for cached diagrams (one JSON file per repo + detail level).
        llm_factory: Callable returning ``(generator, name)`` or ``(None, reason)``.
            Injected so tests never call a real API.
    """

    def __init__(self, cache_dir: str | Path, llm_factory: Any = None) -> None:
        self.cache_dir = Path(cache_dir)
        self._llm_factory = llm_factory or default_llm_factory
        self._locks: dict[str, asyncio.Lock] = {}

    # ── cache helpers ──────────────────────────────────────────────

    def _cache_file(self, repo_path: Path, detail: str) -> Path:
        digest = hashlib.sha256(str(repo_path).encode("utf-8")).hexdigest()[:24]
        return self.cache_dir / f"{digest}_{detail}.json"

    def _read_cache(self, repo_path: Path, detail: str) -> dict[str, Any] | None:
        path = self._cache_file(repo_path, detail)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if data.get("version") != CACHE_VERSION:
            return None
        return data

    def _write_cache(self, repo_path: Path, detail: str, payload: dict[str, Any]) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        target = self._cache_file(repo_path, detail)
        fd, tmp = tempfile.mkstemp(dir=self.cache_dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, target)
        except OSError:
            logger.warning("Could not write system design cache %s", target, exc_info=True)
            with contextlib.suppress(OSError):
                os.unlink(tmp)

    def get_cached(self, repo_path: str | Path, detail: str = "overview") -> dict[str, Any] | None:
        cached = self._read_cache(Path(repo_path).resolve(), detail)
        if not cached:
            return None
        return {**cached["diagram"], "cache_hit": True}

    def clear_cache(self, repo_path: str | Path) -> None:
        for detail in DETAIL_LEVELS:
            with contextlib.suppress(OSError):
                self._cache_file(Path(repo_path).resolve(), detail).unlink()

    # ── main entry point ───────────────────────────────────────────

    async def generate(
        self,
        repo_path: str | Path,
        detail: str = "overview",
        use_ai: bool = True,
        refresh: bool = False,
    ) -> dict[str, Any]:
        detail = detail if detail in DETAIL_LEVELS else "overview"
        root = Path(repo_path).resolve()
        lock = self._locks.setdefault(f"{root}:{detail}", asyncio.Lock())
        async with lock:
            facts = await asyncio.to_thread(collect_repo_facts, root)
            facts_hash = hashlib.sha256(json.dumps(facts, sort_keys=True).encode("utf-8")).hexdigest()

            cached = self._read_cache(root, detail)
            if (
                cached
                and not refresh
                and cached.get("facts_hash") == facts_hash
                and (cached.get("ai_used") or not use_ai or not cached.get("ai_available", True))
            ):
                return {**cached["diagram"], "cache_hit": True}

            draft = build_diagram(facts, detail)
            diagram = draft
            generated_by = "analysis"
            warnings: list[str] = []
            ai_used = False
            ai_available = False

            if use_ai:
                llm, name_or_reason = self._llm_factory()
                if llm is None:
                    warnings.append(f"{name_or_reason} Showing the diagram built from code analysis only.")
                else:
                    ai_available = True
                    try:
                        enriched = await asyncio.wait_for(
                            enrich_with_llm(llm, facts, draft, detail), timeout=LLM_TIMEOUT_SECONDS
                        )
                        candidate = sanitize_diagram(enriched)
                        if len(candidate["nodes"]) >= 3:
                            diagram = enriched
                            generated_by = name_or_reason
                            ai_used = True
                        else:
                            warnings.append("The AI reply was too small to use. Showing the code-analysis diagram.")
                    except TimeoutError:
                        warnings.append("The AI took too long to answer. Showing the code-analysis diagram.")
                    except Exception as exc:  # noqa: BLE001 - any provider/parse error falls back
                        logger.warning("System design AI enrichment failed: %s", exc)
                        warnings.append(
                            f"AI enrichment failed ({type(exc).__name__}). Showing the code-analysis diagram."
                        )

            clean = sanitize_diagram(diagram)
            if facts["stats"].get("truncated"):
                warnings.append("This repository is very large; only part of it was analysed.")
            result = {
                **clean,
                "mermaid": to_mermaid(clean),
                "generated_by": generated_by,
                "detail": detail,
                "warnings": warnings,
                "stats": {
                    **facts["stats"],
                    "components": len(facts["components"]),
                    "nodes": len(clean["nodes"]),
                    "edges": len(clean["edges"]),
                },
                "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "cache_hit": False,
            }
            self._write_cache(
                root,
                detail,
                {
                    "version": CACHE_VERSION,
                    "facts_hash": facts_hash,
                    "ai_used": ai_used,
                    "ai_available": ai_available,
                    "diagram": result,
                },
            )
            return result


def default_llm_factory() -> tuple[TextGenerator | None, str]:
    """Return a Groq generator when GROQ_API_KEY is configured."""
    from backend.core.config import get_settings

    settings = get_settings()
    if not getattr(settings, "groq_api_key", ""):
        return None, "GROQ_API_KEY is not set, so AI enrichment is off."
    from backend.llm.groq import GroqProvider

    model = getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile"
    return GroqProvider(api_key=settings.groq_api_key, model=model), f"groq:{model}"


_service: SystemDesignService | None = None


def get_system_design_service() -> SystemDesignService:
    global _service
    if _service is None:
        from backend.core.config import get_settings

        _service = SystemDesignService(Path(get_settings().cache_dir) / "system_design")
    return _service
