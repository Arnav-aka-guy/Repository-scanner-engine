"""Abstract base class for LLM providers.

Defines the common interface that all concrete LLM provider implementations
(Ollama, OpenAI-compatible, etc.) must satisfy. Both single-shot and
streaming generation methods are required.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class LLMProvider(ABC):
    """Abstract contract every LLM backend must implement.

    Concrete subclasses are responsible for:
    * Constructing the correct HTTP request for their backend.
    * Parsing the backend-specific response format.
    * Surfacing connection / API errors with clear messages.
    """

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        """Generate a complete response for the given prompt.

        Args:
            prompt: The user-facing input text.
            system_prompt: Optional system-level instruction that sets the
                assistant's behaviour and context.
            temperature: Sampling temperature (0.0 = deterministic,
                higher = more creative). Defaults to ``0.7``.

        Returns:
            The full generated text as a single string.

        Raises:
            ConnectionError: When the LLM backend cannot be reached.
            RuntimeError: When the backend returns an unexpected response.
        """

    @abstractmethod
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from the LLM as they are generated.

        Args:
            prompt: The user-facing input text.
            system_prompt: Optional system-level instruction.
            temperature: Sampling temperature. Defaults to ``0.7``.

        Yields:
            Individual tokens (or small chunks) of the response as they
            arrive from the backend.

        Raises:
            ConnectionError: When the LLM backend cannot be reached.
            RuntimeError: When the backend returns an unexpected response.
        """
        # Required so Python treats this as an async generator even though
        # the body is abstract.
        yield ""  # pragma: no cover
