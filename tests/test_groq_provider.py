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
