"""Groq cloud LLM provider — uses OpenAI-compatible chat/completions API."""

from __future__ import annotations

import logging

from backend.llm.openai_compat import OpenAICompatProvider

logger = logging.getLogger(__name__)


class GroqProvider(OpenAICompatProvider):
    """Groq cloud inference via their OpenAI-compatible endpoint.

    Free tier offers generous rate limits with fast inference.
    Recommended models: llama-3.3-70b-versatile, deepseek-r1-distill-llama-70b
    """

    GROQ_BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.3-70b-versatile",
    ) -> None:
        super().__init__(
            base_url=self.GROQ_BASE_URL,
            api_key=api_key,
            model=model,
        )
        logger.info("Groq provider initialized (model: %s)", model)
