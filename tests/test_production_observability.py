"""Tests for Phase 5: Production Setup, Health Probes, and Observability."""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.core.config import Settings
from backend.core.logging import JsonFormatter
from backend.main import app


@pytest.mark.asyncio
async def test_livez_liveness_probe() -> None:
    """GET /livez returns 200 and indicates process is alive."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/livez")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "alive"


@pytest.mark.asyncio
async def test_readyz_readiness_probe_healthy() -> None:
    """GET /readyz returns 200 and reports subsystem health."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/readyz")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ready"
        assert "components" in data
        assert data["components"]["storage"]["status"] == "ok"
        assert data["components"]["embeddings"]["status"] == "ok"


@pytest.mark.asyncio
async def test_readyz_reports_503_on_storage_failure() -> None:
    """GET /readyz returns 503 when a critical subsystem fails."""
    transport = ASGITransport(app=app)
    with patch("pathlib.Path.write_text", side_effect=OSError("Disk full or permission denied")):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/readyz")
            assert response.status_code == 503
            data = response.json()
            assert data.get("status") == "unhealthy"
            assert data["components"]["storage"]["status"] == "error"


@pytest.mark.asyncio
async def test_request_id_generation_and_passthrough() -> None:
    """X-Request-ID is preserved when provided, or generated when missing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Case 1: Client provides custom Request ID
        custom_id = "test-req-id-12345"
        resp1 = await client.get("/livez", headers={"X-Request-ID": custom_id})
        assert resp1.headers.get("X-Request-ID") == custom_id

        # Case 2: No Request ID provided -> Middleware generates one
        resp2 = await client.get("/livez")
        generated_id = resp2.headers.get("X-Request-ID")
        assert generated_id is not None
        assert len(generated_id) > 0
        assert resp2.headers.get("X-Response-Time") is not None


def test_json_formatter_produces_structured_log() -> None:
    """JsonFormatter correctly serializes LogRecord into JSON."""
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Test event occurred with id %s",
        args=("123",),
        exc_info=None,
    )
    record.request_id = "req-abc-999"  # type: ignore[attr-defined]

    formatted_str = formatter.format(record)
    parsed = json.loads(formatted_str)

    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test_logger"
    assert parsed["request_id"] == "req-abc-999"
    assert "Test event occurred with id 123" in parsed["message"]
    assert "timestamp" in parsed


def test_settings_validation_enforces_cloud_jwt_security() -> None:
    """APP_MODE=cloud rejects default or short JWT secrets."""
    with pytest.raises(ValueError, match="requires a secure JWT_SECRET_KEY"):
        Settings(
            app_mode="cloud",
            jwt_secret_key="change-me-to-a-random-secret",
        )

    with pytest.raises(ValueError, match="at least 32 characters"):
        Settings(
            app_mode="cloud",
            jwt_secret_key="short-secret-key",
        )

    # Valid secret passes
    valid_settings = Settings(
        app_mode="cloud",
        jwt_secret_key="a" * 32,
    )
    assert valid_settings.auth_enabled is True
    assert valid_settings.database_enabled is True
