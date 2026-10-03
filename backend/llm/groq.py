"""Groq cloud LLM provider — uses OpenAI-compatible chat/completions API."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from backend.llm.openai_compat import OpenAICompatProvider

logger = logging.getLogger(__name__)

# Fallback candidate models available on Groq in priority order
FALLBACK_GROQ_MODELS: tuple[str, ...] = (
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
)


class GroqProvider(OpenAICompatProvider):
    """Groq cloud inference via their OpenAI-compatible endpoint.

    Free tier offers generous rate limits with fast inference.
    Recommended models: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b
    """

    GROQ_BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(
        self,
        api_key: str,
        model: str = "openai/gpt-oss-120b",
    ) -> None:
        super().__init__(
            base_url=self.GROQ_BASE_URL,
            api_key=api_key,
            model=model,
        )
        logger.info("Groq provider initialized (model: %s)", model)

    def _is_model_error(self, exc_str: str) -> bool:
        """Check if an exception is due to an unavailable, decommissioned, or rate-limited model."""
        indicators = (
            "model_not_found",
            "model_decommissioned",
            "does not exist",
            "not found",
            "404",
            "rate_limit",
            "too large",
            "413",
            "429",
        )
        return any(ind in exc_str.lower() for ind in indicators)

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        try:
            return await super().generate(prompt, system_prompt=system_prompt, temperature=temperature)
        except RuntimeError as exc:
            if self._is_model_error(str(exc)):
                for candidate in FALLBACK_GROQ_MODELS:
                    if candidate != self.model:
                        logger.warning(
                            "Groq model '%s' unavailable (%s). Retrying with '%s'...",
                            self.model,
                            exc,
                            candidate,
                        )
                        self.model = candidate
                        try:
                            return await super().generate(prompt, system_prompt=system_prompt, temperature=temperature)
                        except RuntimeError:
                            continue
            raise

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        try:
            async for token in super().generate_stream(prompt, system_prompt=system_prompt, temperature=temperature):
                yield token
            return
        except RuntimeError as exc:
            if self._is_model_error(str(exc)):
                for candidate in FALLBACK_GROQ_MODELS:
                    if candidate != self.model:
                        logger.warning(
                            "Groq model '%s' unavailable (%s). Retrying stream with '%s'...",
                            self.model,
                            exc,
                            candidate,
                        )
                        self.model = candidate
                        try:
                            async for token in super().generate_stream(
                                prompt, system_prompt=system_prompt, temperature=temperature
                            ):
                                yield token
                            return
                        except RuntimeError:
                            continue
            raise
