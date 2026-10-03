"""Unit tests for GroqProvider resilience, error propagation, and model fallback."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.llm.groq import FALLBACK_GROQ_MODELS, GroqProvider
from backend.llm.provider_manager import ProviderManager


class TestGroqProvider:
    """Test suite for Groq cloud inference provider."""

    def test_init_defaults(self) -> None:
        """Test default model and base URL."""
        provider = GroqProvider(api_key="test-key")
        assert provider.model == "openai/gpt-oss-120b"
        assert provider.base_url == "https://api.groq.com/openai/v1"
        assert provider.api_key == "test-key"

    def test_custom_model_init(self) -> None:
        """Test custom model override on init."""
        provider = GroqProvider(api_key="test-key", model="qwen/qwen3.8-27b")
        assert provider.model == "qwen/qwen3.8-27b"

    @pytest.mark.asyncio
    async def test_generate_fallback_on_404_model_not_found(self) -> None:
        """Verify automatic fallback when primary model returns 404 model_not_found."""
        provider = GroqProvider(api_key="test-key", model="nonexistent-model")

        call_count = 0

        async def mock_post(url, json=None, headers=None):
            nonlocal call_count
            call_count += 1
            mock_resp = MagicMock()
            if json.get("model") == "nonexistent-model":
                mock_resp.status_code = 404
                mock_resp.text = '{"error":{"message":"The model does not exist","code":"model_not_found"}}'
            else:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    "choices": [{"message": {"content": "Fallback succeeded"}}]
                }
            return mock_resp

        with patch.object(provider, "_get_client") as mock_client_factory:
            mock_client = AsyncMock()
            mock_client.post = mock_post
            mock_client_factory.return_value = mock_client

            result = await provider.generate("Test prompt")
            assert result == "Fallback succeeded"
            assert call_count >= 2
            assert provider.model in FALLBACK_GROQ_MODELS

    @pytest.mark.asyncio
    async def test_provider_manager_picks_up_groq(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Verify ProviderManager prioritizes Groq when API key is set."""
        from backend.core.config import get_settings

        settings = get_settings()
        monkeypatch.setattr(settings, "groq_api_key", "mock-groq-key")
        monkeypatch.setattr(settings, "groq_model", "openai/gpt-oss-120b")

        pm = ProviderManager()
        provider_names = [name for name, _ in pm.providers]
        assert "groq" in provider_names
        assert pm.active_provider_name == "groq"

    @pytest.mark.asyncio
    async def test_generate_fallback_on_429_provider_http_error(self) -> None:
        """Verify fallback triggers on a 429 ProviderHTTPError."""
        provider = GroqProvider(api_key="test-key", model="rate-limited-model")

        call_count = 0

        async def mock_post(url, json=None, headers=None):
            nonlocal call_count
            call_count += 1
            mock_resp = MagicMock()
            if json.get("model") == "rate-limited-model":
                mock_resp.status_code = 429
                mock_resp.text = '{"error":{"message":"Rate limit reached","code":"rate_limit_exceeded"}}'
            else:
                mock_resp.status_code = 200
                mock_resp.json.return_value = {
                    "choices": [{"message": {"content": "Fallback succeeded after 429"}}]
                }
            return mock_resp

        with patch.object(provider, "_get_client") as mock_client_factory:
            mock_client = AsyncMock()
            mock_client.post = mock_post
            mock_client_factory.return_value = mock_client

            result = await provider.generate("Test prompt")
            assert result == "Fallback succeeded after 429"
            assert call_count >= 2

    @pytest.mark.asyncio
    async def test_no_fallback_on_unrelated_error_with_404_in_message(self) -> None:
        """Verify fallback does NOT trigger on an unrelated error whose message contains '404'."""
        provider = GroqProvider(api_key="test-key", model="any-model")

        async def mock_post(url, json=None, headers=None):
            raise RuntimeError("Database connection lost at row 404 in cluster")

        with patch.object(provider, "_get_client") as mock_client_factory:
            mock_client = AsyncMock()
            mock_client.post = mock_post
            mock_client_factory.return_value = mock_client

            with pytest.raises(RuntimeError) as exc_info:
                await provider.generate("Test prompt")
            assert "404 in cluster" in str(exc_info.value)
            # Model should NOT have changed to a fallback model
            assert provider.model == "any-model"


class TestContextBudgeting:
    """Test suite for context char budgeting in LLMService."""

    def test_budgeting_never_splits_chunks_and_respects_budget(self) -> None:
        """Budgeting adds whole chunks in rank order and never splits a chunk in half."""
        from backend.llm.service import LLMService

        service = LLMService()

        # Create 3 chunks of length 100 characters each
        chunk1 = "A" * 100
        chunk2 = "B" * 100
        chunk3 = "C" * 100

        # Budget of 250 characters:
        # chunk1 (100) + "\n\n" (2) + chunk2 (100) = 202 <= 250
        # chunk3 would require 202 + 2 + 100 = 304 > 250
        chunks = [chunk1, chunk2, chunk3]
        result = service.fit_context_budget(chunks, budget=250)

        assert len(result) == 2
        assert result[0] == chunk1
        assert result[1] == chunk2
        # Never split chunk2 or chunk3 in half
        assert len(result[0]) == 100
        assert len(result[1]) == 100
        joined = "\n\n".join(result)
        assert len(joined) <= 250
        assert chunk3 not in result

    def test_budget_provider_aware_defaults(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test provider-aware defaults: 12000 for Groq, 32000 for others, overridable from config."""
        from backend.core.config import get_settings
        from backend.llm.service import LLMService

        settings = get_settings()
        service = LLMService()

        monkeypatch.setattr(settings, "llm_context_char_budget", None)
        assert service.get_context_budget("groq") == 12_000
        assert service.get_context_budget("openai") == 32_000
        assert service.get_context_budget("ollama") == 32_000

        # Overridden via env / config setting
        monkeypatch.setattr(settings, "llm_context_char_budget", 15_000)
        assert service.get_context_budget("groq") == 15_000
        assert service.get_context_budget("openai") == 15_000

    def test_oversized_first_chunk_skipped_for_small_second_chunk(self) -> None:
        """An oversized first chunk is skipped and smaller second chunk is included."""
        from backend.llm.service import LLMService

        service = LLMService()
        chunk1 = "A" * 200
        chunk2 = "B" * 50

        result = service.fit_context_budget([chunk1, chunk2], budget=100)
        assert result == [chunk2]

    def test_single_oversized_chunk_truncated_never_empty(self) -> None:
        """A single oversized chunk returns a truncated version and is never empty."""
        from backend.llm.service import LLMService

        service = LLMService()
        chunk = "line 1\nline 2\nline 3\nline 4\nline 5\n" + ("X" * 100)

        result = service.fit_context_budget([chunk], budget=30)
        assert len(result) == 1
        assert "[truncated]" in result[0]
        assert len(result[0]) <= 30

    def test_sanitize_error_message_strips_api_keys_and_caps_length(self) -> None:
        """Verify chat error message sanitizer strips API keys and caps length to ~300 chars."""
        from backend.api.chat import _sanitize_error_message

        raw = "Failed with gsk_abcdef1234567890_extra and sk-live123456789012345678 and Bearer supersecrettoken123"
        sanitized = _sanitize_error_message(raw, max_length=300)
        assert "gsk_" not in sanitized
        assert "sk-live" not in sanitized
        assert "[REDACTED]" in sanitized

        long_err = "Error: " + ("x" * 500)
        capped = _sanitize_error_message(long_err, max_length=300)
        assert len(capped) <= 300
        assert capped.endswith("...")
