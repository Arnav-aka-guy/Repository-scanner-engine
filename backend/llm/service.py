"""LLM orchestration service supporting prompt templates and multi-provider fallback."""

from __future__ import annotations

import logging
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

    async def answer_question(self, question: str, context: str) -> str:
        """Answer a codebase question using retrieved context."""
        system_prompt, prompt = self._build_qa_prompt(question, context)
        return await self.manager.generate(prompt, system_prompt=system_prompt)

    async def answer_question_stream(self, question: str, context: str) -> AsyncGenerator[str, None]:
        """Stream an answer to a codebase question using retrieved context."""
        system_prompt, prompt = self._build_qa_prompt(question, context)
        async for token in self.manager.generate_stream(prompt, system_prompt=system_prompt):
            yield token

    async def generate_documentation(self, code: str, entity_type: str) -> str:
        """Generate formatted docstring/onboarding guide for a code entity."""
        system_prompt, prompt = self._build_doc_prompt(code, entity_type)
        return await self.manager.generate(prompt, system_prompt=system_prompt)

    def _build_qa_prompt(self, question: str, context: str) -> tuple[str, str]:
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

        user = (
            f"Here is the retrieved codebase context:\n\n"
            f"{context}\n\n"
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
