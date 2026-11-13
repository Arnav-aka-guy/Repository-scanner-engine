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
from typing import Any, cast

from backend.llm.exceptions import ProviderHTTPError
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
        if not isinstance(data, dict):
            return None
        if data.get("version") != CACHE_VERSION:
            return None
        return cast(dict[str, Any], data)

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
                raw_factory_res = self._llm_factory()
                providers: list[tuple[TextGenerator, str, dict[str, Any], str]] = []
                unconfigured_reason = ""

                if isinstance(raw_factory_res, list):
                    for item in raw_factory_res:
                        if isinstance(item, tuple):
                            llm_gen = item[0]
                            name = item[1]
                            extra = item[2] if len(item) > 2 else {}
                            ptype = (
                                item[3]
                                if len(item) > 3
                                else (
                                    "groq"
                                    if "groq" in name.lower()
                                    else "openrouter"
                                    if "openrouter" in name.lower()
                                    else "custom"
                                )
                            )
                            providers.append((llm_gen, name, extra, ptype))
                elif isinstance(raw_factory_res, tuple):
                    if raw_factory_res[0] is None:
                        unconfigured_reason = str(raw_factory_res[1])
                    else:
                        llm_gen = raw_factory_res[0]
                        name = raw_factory_res[1]
                        extra = raw_factory_res[2] if len(raw_factory_res) > 2 else {}
                        ptype = (
                            raw_factory_res[3]
                            if len(raw_factory_res) > 3
                            else (
                                "groq"
                                if "groq" in name.lower()
                                else "openrouter"
                                if "openrouter" in name.lower()
                                else "custom"
                            )
                        )
                        providers.append((llm_gen, name, extra, ptype))

                if not providers:
                    reason = unconfigured_reason or "AI enrichment is not configured."
                    warnings.append(f"{reason} Showing the diagram built from code analysis only.")
                else:
                    ai_available = True
                    attempt_errors: list[dict[str, Any]] = []

                    for llm, name, extra_body, provider_type in providers:
                        success = False
                        current_extra = dict(extra_body) if extra_body else {}

                        async def _attempt(
                            generator: TextGenerator, extra_payload: dict[str, Any] | None
                        ) -> dict[str, Any]:
                            enriched = await asyncio.wait_for(
                                enrich_with_llm(generator, facts, draft, detail, extra_body=extra_payload),
                                timeout=LLM_TIMEOUT_SECONDS,
                            )
                            return sanitize_diagram(enriched)

                        try:
                            candidate = await _attempt(llm, current_extra)
                            if len(candidate["nodes"]) >= 3:
                                diagram = candidate
                                generated_by = name
                                ai_used = True
                                success = True
                                break
                            logger.warning("Provider %s reply too small (nodes < 3). Moving to next provider.", name)
                            attempt_errors.append(
                                {"name": name, "type": provider_type, "status": 200, "reason": "too_small"}
                            )
                        except ProviderHTTPError as exc:
                            logger.warning(
                                "Provider %s attempt failed: status=%d error=%s",
                                name,
                                exc.status_code,
                                exc.error_code or exc.message,
                            )
                            attempt_errors.append(
                                {"name": name, "type": provider_type, "status": exc.status_code, "reason": exc.message}
                            )
                            if exc.status_code == 429:
                                wait_sec = min(exc.retry_after if exc.retry_after is not None else 5.0, 20.0)
                                logger.warning(
                                    "Provider %s 429 rate limit exceeded. Waiting %.1fs before retry.", name, wait_sec
                                )
                                await asyncio.sleep(wait_sec)
                                try:
                                    candidate = await _attempt(llm, current_extra)
                                    if len(candidate["nodes"]) >= 3:
                                        diagram = candidate
                                        generated_by = name
                                        ai_used = True
                                        success = True
                                        break
                                    logger.warning("Provider %s retry reply too small (nodes < 3).", name)
                                except Exception as retry_exc:
                                    logger.warning("Provider %s retry failed after 429: %s", name, retry_exc)
                            elif exc.status_code == 400 and provider_type == "groq":
                                cleaned_extra = {
                                    k: v
                                    for k, v in current_extra.items()
                                    if k not in ("response_format", "reasoning_effort")
                                }
                                logger.warning(
                                    "Provider %s 400 error. Retrying once without response_format and reasoning_effort.",
                                    name,
                                )
                                try:
                                    candidate = await _attempt(llm, cleaned_extra)
                                    if len(candidate["nodes"]) >= 3:
                                        diagram = candidate
                                        generated_by = name
                                        ai_used = True
                                        success = True
                                        break
                                    logger.warning("Provider %s retry reply too small (nodes < 3).", name)
                                except Exception as retry_exc:
                                    logger.warning("Provider %s retry failed after 400: %s", name, retry_exc)
                            elif exc.status_code == 413:
                                logger.warning(
                                    "Provider %s 413 payload too large. Skipping retry on this provider.", name
                                )
                        except TimeoutError:
                            logger.warning(
                                "Provider %s timed out after %ds. Moving to next provider.", name, LLM_TIMEOUT_SECONDS
                            )
                            attempt_errors.append(
                                {"name": name, "type": provider_type, "status": 408, "reason": "timeout"}
                            )
                        except Exception as exc:  # noqa: BLE001
                            logger.warning("Provider %s failed: %s. Moving to next provider.", name, exc)
                            attempt_errors.append(
                                {"name": name, "type": provider_type, "status": 500, "reason": str(exc), "exc": exc}
                            )

                        if success:
                            break

                    if not ai_used:
                        has_groq_exhausted = any(
                            e["type"] == "groq"
                            and (e["status"] in (413, 429) or "rate" in str(e.get("reason", "")).lower())
                            for e in attempt_errors
                        )
                        has_openrouter_tried = any(e["type"] == "openrouter" for e in attempt_errors)
                        if has_groq_exhausted and has_openrouter_tried:
                            warnings.append(
                                "Groq is over its free limit right now and OpenRouter did not answer. "
                                "Showing the code-analysis diagram. Try again in a minute."
                            )
                        elif has_groq_exhausted:
                            warnings.append(
                                "Groq is over its free limit right now. "
                                "Showing the code-analysis diagram. Try again in a minute."
                            )
                        elif any(e.get("reason") == "too_small" for e in attempt_errors):
                            warnings.append("The AI reply was too small to use. Showing the code-analysis diagram.")
                        elif any(e.get("reason") == "timeout" for e in attempt_errors):
                            warnings.append("The AI took too long to answer. Showing the code-analysis diagram.")
                        else:
                            first_err = attempt_errors[0] if attempt_errors else {}
                            exc_obj = first_err.get("exc")
                            err_name = type(exc_obj).__name__ if isinstance(exc_obj, Exception) else "Failed"
                            warnings.append(f"AI enrichment failed ({err_name}). Showing the code-analysis diagram.")

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


def default_llm_factory() -> list[tuple[TextGenerator, str, dict[str, Any], str]] | tuple[None, str]:
    """Return a chain of LLM providers (Groq primary, OpenRouter fallback)."""
    from backend.core.config import get_settings

    settings = get_settings()
    chain: list[tuple[TextGenerator, str, dict[str, Any], str]] = []

    if getattr(settings, "groq_api_key", ""):
        from backend.llm.groq import GroqProvider

        model = getattr(settings, "system_design_model", "") or "openai/gpt-oss-120b"
        groq_extra = {
            "max_completion_tokens": 2500,
            "reasoning_effort": "low",
            "response_format": {"type": "json_object"},
        }
        chain.append((GroqProvider(api_key=settings.groq_api_key, model=model), f"groq:{model}", groq_extra, "groq"))

    if getattr(settings, "openrouter_api_key", ""):
        from backend.llm.openrouter import OpenRouterProvider

        model = getattr(settings, "system_design_fallback_model", "") or "openai/gpt-oss-120b:free"
        openrouter_extra = {
            "max_tokens": 2500,
            "reasoning": {"effort": "low"},
        }
        chain.append(
            (
                OpenRouterProvider(api_key=settings.openrouter_api_key, model=model),
                f"openrouter:{model}",
                openrouter_extra,
                "openrouter",
            )
        )

    if not chain:
        return None, "GROQ_API_KEY is not set, so AI enrichment is off."
    return chain


_service: SystemDesignService | None = None


def get_system_design_service() -> SystemDesignService:
    global _service
    if _service is None:
        from backend.core.config import get_settings

        _service = SystemDesignService(Path(get_settings().cache_dir) / "system_design")
    return _service
