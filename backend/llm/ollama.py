"""Ollama LLM provider implementation for local repository understanding."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

import httpx

from backend.llm.provider import LLMProvider

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    """Integrates with a locally running Ollama instance via its REST API."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature}
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code != 200:
                    raise RuntimeError(f"Ollama returned HTTP status code {response.status_code}: {response.text}")
                
                data = response.json()
                return data.get("response", "")
        except httpx.RequestError as e:
            logger.error("Failed to connect to Ollama at %s: %s", url, e)
            raise ConnectionError(
                f"Could not connect to local Ollama server at {self.base_url}. "
                "Please verify that Ollama is running (`ollama serve`) and you have installed "
                f"the '{self.model}' model (`ollama pull {self.model}`)."
            ) from e

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {"temperature": temperature}
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        raise RuntimeError(f"Ollama returned HTTP status code {response.status_code}")
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("response", "")
                            if token:
                                yield token
                        except json.JSONDecodeError:
                            continue
        except httpx.RequestError as e:
            logger.error("Failed to connect to Ollama stream at %s: %s", url, e)
            raise ConnectionError(
                f"Failed to connect to local Ollama server at {self.base_url}."
            ) from e
