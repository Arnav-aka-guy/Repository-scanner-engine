"""LLM orchestration service supporting prompt templates and multi-provider fallback."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncGenerator
from typing import Any

from backend.llm.provider_manager import ProviderManager

logger = logging.getLogger(__name__)


class LLMService:
    """Orchestrates prompts, manages provider fallback chain, and queries LLMs."""

    def __init__(self) -> None:
        self.manager = ProviderManager()

    def get_provider_status(self) -> list[dict[str, Any]]:
        """Return status of all configured providers."""
        return self.manager.get_provider_status()

    def get_context_budget(self, provider: str | None = None) -> int:
        """Return the effective context character budget for the active provider."""
        from backend.core.config import get_settings

        settings = get_settings()
        active = provider or getattr(self.manager, "active_provider_name", None) or settings.llm_provider
        return settings.get_context_char_budget(active)

    def _split_into_chunks(self, context: str | list[str]) -> list[str]:
        """Split a context string or sequence into distinct chunk units."""
        if isinstance(context, list):
            return [str(c).strip() for c in context if str(c).strip()]
        if not context or not context.strip():
            return []
        # If formatted with hybrid retriever context item headers
        if "--- [Context Item #" in context:
            parts = re.split(r"(?:\n\n|^)(?=--- \[Context Item #\d+\] ---)", context.strip())
            return [p.strip() for p in parts if p.strip()]
        # Fallback to double newline separation
        if "\n\n" in context:
            return [p.strip() for p in context.split("\n\n") if p.strip()]
        return [context.strip()]

    def fit_context_budget(
        self,
        context: str | list[str],
        budget: int | None = None,
    ) -> list[str]:
        """Add whole retrieved chunks in rank order until the budget is reached.

        Never splits a chunk in half. Chunks that do not fit in their entirety
        are excluded to ensure only whole chunks are cited.
        """
        if budget is None:
            budget = self.get_context_budget()

        chunks = self._split_into_chunks(context)
        included: list[str] = []
        current_len = 0

        for chunk in chunks:
            needed = len(chunk) if not included else len(chunk) + 2  # for "\n\n"
            if current_len + needed <= budget:
                included.append(chunk)
                current_len += needed
            else:
                # Do not slice in half — stop adding chunks
                break

        return included

    async def answer_question(self, question: str, context: str | list[str]) -> str:
        """Answer a codebase question using retrieved context."""
        system_prompt, prompt = self._build_qa_prompt(question, context)
        return await self.manager.generate(prompt, system_prompt=system_prompt)

    async def answer_question_stream(self, question: str, context: str | list[str]) -> AsyncGenerator[str, None]:
        """Stream an answer to a codebase question using retrieved context."""
        system_prompt, prompt = self._build_qa_prompt(question, context)
        async for token in self.manager.generate_stream(prompt, system_prompt=system_prompt):
            yield token

    async def generate_documentation(self, code: str, entity_type: str) -> str:
        """Generate formatted docstring/onboarding guide for a code entity."""
        system_prompt, prompt = self._build_doc_prompt(code, entity_type)
        return await self.manager.generate(prompt, system_prompt=system_prompt)

    def _build_qa_prompt(self, question: str, context: str | list[str]) -> tuple[str, str]:
        """Construct prompt pair for QA."""
        system = (
            "You are Antigravity, an expert software architecture AI. "
            "You possess thorough codebase understanding and assist developers in "
            "navigating, parsing, and reasoning about repository layouts.\n\n"
            "Below is a set of highly relevant source code snippets, module structures, "
            "and dependencies extracted from the codebase. Use this context to answer the "
            "user's question with precise details. Reference specific file names, "
            "class/function names, and line numbers. Code blocks should be properly styled. "
            "If the context doesn't contain the necessary details to answer, politely state that.\n\n"
            "CRITICAL CITATION REQUIREMENT:\n"
            "At the end of your answer, provide a 'Sources:' section listing the exact files "
            "and line ranges you referenced from the provided context in the format:\n"
            "Sources:\n"
            "- <file_path>:<start_line>-<end_line> (`<entity_name>`)\n"
            "Only cite documents actually provided in the context."
        )

        included_chunks = self.fit_context_budget(context)
        safe_context = (
            "\n\n".join(included_chunks)
            if included_chunks
            else ("No relevant code context was found in the repository.")
        )

        user = (
            f"Here is the retrieved codebase context:\n\n"
            f"{safe_context}\n\n"
            f"Question: {question}\n\n"
            f"Provide a clear, detailed, professional answer followed by the Sources citation list."
        )

        return system, user

    def _build_doc_prompt(self, code: str, entity_type: str) -> tuple[str, str]:
        """Construct prompt pair for documentation generation."""
        system = (
            "You are an expert technical writer specializing in clean software architecture documentation. "
            "Generate detailed, professional, and readable markdown documentation for codebases."
        )

        user = (
            f"Generate structured markdown documentation for the following {entity_type}.\n"
            f"Explain its purpose, high-level interface/behavior, design choices, "
            f"and describe inputs and outputs if applicable.\n\n"
            f"Source code:\n```python\n{code}\n```"
        )

        return system, user
