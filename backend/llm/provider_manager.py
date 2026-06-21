"""Multi-provider LLM manager with automatic fallback chain."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from backend.core.config import get_settings
from backend.llm.provider import LLMProvider

logger = logging.getLogger(__name__)


class ProviderManager:
    """Manages multiple LLM providers with automatic fallback.

    Fallback order: Groq → OpenAI → OpenRouter → Ollama
    Each provider is only added if its API key is configured.
    Ollama is always available as the last resort (local).
    """

    def __init__(self) -> None:
        self.providers: list[tuple[str, LLMProvider]] = []
        self.active_provider_name: str = ""
        self._configure_chain()

    def _configure_chain(self) -> None:
        """Build the provider fallback chain based on available API keys."""
        settings = get_settings()

        # 1. Groq (preferred — free, fast)
        if settings.groq_api_key:
            from backend.llm.groq import GroqProvider
            provider = GroqProvider(
                api_key=settings.groq_api_key,
                model=settings.groq_model,
            )
            self.providers.append(("groq", provider))
            logger.info("Provider chain: added Groq (%s)", settings.groq_model)

        # 2. OpenAI
        if settings.openai_api_key:
            from backend.llm.openai_compat import OpenAICompatProvider
            provider = OpenAICompatProvider(
                base_url=settings.openai_base_url,
                api_key=settings.openai_api_key,
                model=settings.llm_model,
            )
            self.providers.append(("openai", provider))
            logger.info("Provider chain: added OpenAI (%s)", settings.llm_model)

        # 3. OpenRouter
        if settings.openrouter_api_key:
            from backend.llm.openrouter import OpenRouterProvider
            provider = OpenRouterProvider(
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
            )
            self.providers.append(("openrouter", provider))
            logger.info("Provider chain: added OpenRouter (%s)", settings.openrouter_model)

        # 4. Ollama (local fallback — always available)
        from backend.llm.ollama import OllamaProvider
        provider = OllamaProvider(
            base_url=settings.llm_base_url,
            model=settings.llm_model,
        )
        self.providers.append(("ollama", provider))
        logger.info("Provider chain: added Ollama (%s @ %s)", settings.llm_model, settings.llm_base_url)

        if self.providers:
            self.active_provider_name = self.providers[0][0]
            logger.info("Active LLM provider: %s (with %d fallbacks)",
                        self.active_provider_name, len(self.providers) - 1)

    def get_provider_status(self) -> list[dict[str, Any]]:
        """Return status info for all configured providers."""
        return [
            {"name": name, "model": getattr(p, "model", "unknown"),
             "active": name == self.active_provider_name}
            for name, p in self.providers
        ]

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        """Try each provider in fallback order. Return first successful response."""
        errors: list[str] = []

        for name, provider in self.providers:
            try:
                logger.debug("Attempting generation with provider: %s", name)
                result = await provider.generate(prompt, system_prompt, temperature)
                self.active_provider_name = name
                return result
            except Exception as exc:
                error_msg = f"{name}: {exc}"
                errors.append(error_msg)
                logger.warning("Provider %s failed: %s — trying next", name, exc)
                continue

        raise RuntimeError(
            f"All LLM providers failed. Tried {len(self.providers)} provider(s).\n"
            + "\n".join(f"  • {e}" for e in errors)
            + "\n\nPlease configure at least one provider:\n"
            "  • Set GROQ_API_KEY for free cloud inference (recommended)\n"
            "  • Or run Ollama locally: ollama serve && ollama pull llama3"
        )

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Try each provider for streaming. Return first successful stream."""
        errors: list[str] = []

        for name, provider in self.providers:
            try:
                logger.debug("Attempting streaming with provider: %s", name)
                # Test connectivity by starting the stream
                async for token in provider.generate_stream(prompt, system_prompt, temperature):
                    self.active_provider_name = name
                    yield token
                return  # Stream completed successfully
            except Exception as exc:
                error_msg = f"{name}: {exc}"
                errors.append(error_msg)
                logger.warning("Provider %s stream failed: %s — trying next", name, exc)
                continue

        raise RuntimeError(
            f"All LLM providers failed for streaming. Tried {len(self.providers)} provider(s).\n"
            + "\n".join(f"  • {e}" for e in errors)
        )
