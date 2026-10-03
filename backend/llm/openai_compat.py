"""OpenAI-compatible LLM provider implementation supporting custom backends and API keys."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

import httpx

from backend.llm.provider import LLMProvider

logger = logging.getLogger(__name__)


class OpenAICompatProvider(LLMProvider):
    """Integrates with OpenAI-compatible API endpoints (OpenAI, Anthropic adapters, OpenRouter, LM Studio, etc.)."""

    _client: httpx.AsyncClient | None = None

    def __init__(
        self, base_url: str = "https://api.openai.com/v1", api_key: str = "", model: str = "gpt-4o-mini"
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def _get_client(self) -> httpx.AsyncClient:
        """Return a shared httpx client for connection pooling."""
        if OpenAICompatProvider._client is None or OpenAICompatProvider._client.is_closed:
            OpenAICompatProvider._client = httpx.AsyncClient(timeout=60.0)
        return OpenAICompatProvider._client

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        url = f"{self.base_url}/chat/completions"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {"model": self.model, "messages": messages, "temperature": temperature, "stream": False}

        try:
            client = self._get_client()
            response = await client.post(url, json=payload, headers=self._headers())
            if response.status_code != 200:
                try:
                    err_json = response.json()
                    parsed_msg = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    parsed_msg = response.text
                raise RuntimeError(f"API Error ({response.status_code}): {parsed_msg}")

            data = response.json()
            return str(data["choices"][0]["message"]["content"])

        except httpx.RequestError as e:
            logger.error("Failed to connect to OpenAI-compatible API at %s: %s", url, e)
            raise ConnectionError(
                f"Could not connect to OpenAI-compatible host at {self.base_url}. "
                "Please verify your internet connection and API endpoints."
            ) from e

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/chat/completions"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {"model": self.model, "messages": messages, "temperature": temperature, "stream": True}

        try:
            client = self._get_client()
            async with client.stream("POST", url, json=payload, headers=self._headers()) as response:
                if response.status_code != 200:
                    await response.aread()
                    err_msg = response.text
                    logger.error("OpenAI-compatible stream error (%d): %s", response.status_code, err_msg)
                    try:
                        err_json = json.loads(err_msg)
                        parsed_msg = err_json.get("error", {}).get("message", err_msg)
                    except Exception:
                        parsed_msg = err_msg
                    raise RuntimeError(f"API Error ({response.status_code}): {parsed_msg}")

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                token = delta.get("content", "")
                                if token:
                                    yield token
                        except json.JSONDecodeError:
                            continue

        except httpx.RequestError as e:
            logger.error("Failed to connect to OpenAI-compatible stream at %s: %s", url, e)
            raise ConnectionError(f"Failed to connect to OpenAI-compatible API stream at {self.base_url}.") from e
