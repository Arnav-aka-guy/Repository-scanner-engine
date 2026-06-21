"""OpenRouter cloud LLM provider — routes to multiple model providers."""

from __future__ import annotations

import logging

from backend.llm.openai_compat import OpenAICompatProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(OpenAICompatProvider):
    """OpenRouter aggregator — single API key accesses 100+ models."""

    OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(
        self,
        api_key: str,
        model: str = "meta-llama/llama-3.3-70b-instruct",
    ) -> None:
        super().__init__(
            base_url=self.OPENROUTER_BASE_URL,
            api_key=api_key,
            model=model,
        )
        logger.info("OpenRouter provider initialized (model: %s)", model)
