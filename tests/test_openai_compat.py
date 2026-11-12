"""Tests for OpenAICompatProvider options (model override, extra_body, retry_after)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.llm.exceptions import ProviderHTTPError
from backend.llm.openai_compat import OpenAICompatProvider


@pytest.mark.asyncio
async def test_generate_default_payload_matches_legacy() -> None:
    """When neither model nor extra_body is passed, sent JSON payload matches legacy structure exactly."""
    provider = OpenAICompatProvider(api_key="sk-test", model="gpt-4o-mini")

    captured_payload = None

    async def mock_post(url, json=None, headers=None):
        nonlocal captured_payload
        captured_payload = json
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        result = await provider.generate("Hello world", system_prompt="You are helpful", temperature=0.5)

    assert result == "ok"
    assert captured_payload == {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "Hello world"},
        ],
        "temperature": 0.5,
        "stream": False,
    }
    assert provider.model == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_generate_with_model_override() -> None:
    """Model argument overrides model in payload for single request without modifying provider.model."""
    provider = OpenAICompatProvider(api_key="sk-test", model="default-model")

    captured_payload = None

    async def mock_post(url, json=None, headers=None):
        nonlocal captured_payload
        captured_payload = json
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "custom model ok"}}]}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        result = await provider.generate("Hello", model="custom-override-model")

    assert result == "custom model ok"
    assert captured_payload["model"] == "custom-override-model"
    assert provider.model == "default-model"  # never changed!


@pytest.mark.asyncio
async def test_generate_with_extra_body_merged_and_sanitized() -> None:
    """Extra body fields are merged into payload, but model/messages/stream cannot be overwritten."""
    provider = OpenAICompatProvider(api_key="sk-test", model="base-model")

    captured_payload = None

    async def mock_post(url, json=None, headers=None):
        nonlocal captured_payload
        captured_payload = json
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "json ok"}}]}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        result = await provider.generate(
            "Hello",
            extra_body={
                "max_completion_tokens": 2500,
                "reasoning_effort": "low",
                "response_format": {"type": "json_object"},
                "model": "malicious-model",
                "messages": [{"role": "user", "content": "malicious"}],
                "stream": True,
            },
        )

    assert result == "json ok"
    assert captured_payload["model"] == "base-model"
    assert captured_payload["stream"] is False
    assert len(captured_payload["messages"]) == 1
    assert captured_payload["messages"][0]["content"] == "Hello"
    assert captured_payload["max_completion_tokens"] == 2500
    assert captured_payload["reasoning_effort"] == "low"
    assert captured_payload["response_format"] == {"type": "json_object"}


@pytest.mark.asyncio
async def test_provider_http_error_stores_retry_after() -> None:
    """ProviderHTTPError parses and exposes retry_after in seconds from Retry-After header."""
    provider = OpenAICompatProvider(api_key="sk-test", model="base-model")

    async def mock_post(url, json=None, headers=None):
        resp = MagicMock()
        resp.status_code = 429
        resp.text = '{"error":{"message":"Rate limit reached","code":"rate_limit_exceeded"}}'
        resp.json.return_value = {"error": {"message": "Rate limit reached", "code": "rate_limit_exceeded"}}
        resp.headers = {"retry-after": "12.5"}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        with pytest.raises(ProviderHTTPError) as exc_info:
            await provider.generate("Test prompt")

    exc = exc_info.value
    assert exc.status_code == 429
    assert exc.retry_after == 12.5


@pytest.mark.asyncio
async def test_provider_http_error_retry_after_none_when_missing() -> None:
    """ProviderHTTPError sets retry_after to None if Retry-After header is omitted or invalid."""
    provider = OpenAICompatProvider(api_key="sk-test", model="base-model")

    async def mock_post(url, json=None, headers=None):
        resp = MagicMock()
        resp.status_code = 500
        resp.text = "Internal error"
        resp.json.side_effect = ValueError("no json")
        resp.headers = {}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        with pytest.raises(ProviderHTTPError) as exc_info:
            await provider.generate("Test prompt")

    exc = exc_info.value
    assert exc.status_code == 500
    assert exc.retry_after is None
