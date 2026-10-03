"""Integration tests that actually trigger HTTP 429 rate-limit responses.

These tests fire real repeated HTTP requests using the ASGI TestClient and
verify that 429 is returned once the per-route limit is exceeded.

Rate limits configured in backend/security/rate_limiter.py:
  SCAN_RATE   = "5/minute"
  SEARCH_RATE = "30/minute"
  CHAT_RATE   = "20/minute"
  FILE_RATE   = "60/minute"

slowapi uses an in-memory store by default, so limits accumulate across
requests within the same TestClient session.  Each test class uses a unique
``X-Forwarded-For`` IP so tests are isolated from one another.

NOTE: The ``low_limit_client`` fixture is kept for forward-compatibility but
the main tests use the real app limits, sending enough requests to breach them
without waiting for real wall-clock time.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_client() -> TestClient:
    """Return a TestClient wrapping the real FastAPI app."""
    from backend.main import app

    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Optional fixture (kept per spec; not used by the tests below because the
# @limiter.limit() decorators capture the rate-string at decoration/import
# time, so patching module attributes after import has no effect on them).
# ---------------------------------------------------------------------------


@pytest.fixture()
def low_limit_client():
    """Return a TestClient with scan/search/chat limits set to 1/minute.

    NOTE: This fixture patches the module-level constants but those constants
    are evaluated at decoration time, so already-imported routers will not
    see the change.  The fixture is provided for completeness and potential
    future use with freshly-imported routers.
    """
    from backend.main import app
    import backend.security.rate_limiter as rl

    with (
        patch.object(rl, "SCAN_RATE", "1/minute"),
        patch.object(rl, "SEARCH_RATE", "1/minute"),
        patch.object(rl, "CHAT_RATE", "1/minute"),
        patch.object(rl, "FILE_RATE", "1/minute"),
    ):
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRateLimit429:
    """Verify that exceeding configured rate limits produces HTTP 429."""

    # Each test uses a distinct IP to avoid cross-test contamination.

    def test_scan_returns_429_after_limit(self, tmp_path):
        """Sending more than SCAN_RATE (5/minute) requests must trigger 429."""
        with _make_client() as client:
            hit_429 = False
            # SCAN_RATE = 5/minute → 7 attempts is sufficient to trip it.
            for _ in range(7):
                r = client.post(
                    "/api/repository/scan",
                    json={"path": str(tmp_path), "force": False},
                    headers={"X-Forwarded-For": "10.1.0.1"},
                )
                if r.status_code == 429:
                    hit_429 = True
                    break
            assert hit_429, (
                "Expected HTTP 429 after exceeding scan rate limit (5/minute). "
                f"Last status: {r.status_code}"
            )

    def test_search_returns_429_after_limit(self, tmp_path):
        """Sending more than SEARCH_RATE (30/minute) requests must trigger 429."""
        with _make_client() as client:
            hit_429 = False
            # SEARCH_RATE = 30/minute → 35 attempts is sufficient.
            for _ in range(35):
                r = client.post(
                    "/api/search",
                    json={"query": "test", "repo_path": str(tmp_path)},
                    headers={"X-Forwarded-For": "10.1.0.2"},
                )
                if r.status_code == 429:
                    hit_429 = True
                    break
            assert hit_429, (
                "Expected HTTP 429 after exceeding search rate limit (30/minute). "
                f"Last status: {r.status_code}"
            )

    def test_chat_returns_429_after_limit(self, tmp_path):
        """Sending more than CHAT_RATE (20/minute) requests must trigger 429."""
        with _make_client() as client:
            hit_429 = False
            # CHAT_RATE = 20/minute → 25 attempts is sufficient.
            for _ in range(25):
                r = client.post(
                    "/api/chat",
                    json={
                        "question": "What does this code do?",
                        "repo_path": str(tmp_path),
                    },
                    headers={"X-Forwarded-For": "10.1.0.3"},
                )
                if r.status_code == 429:
                    hit_429 = True
                    break
            assert hit_429, (
                "Expected HTTP 429 after exceeding chat rate limit (20/minute). "
                f"Last status: {r.status_code}"
            )

    def test_scan_first_request_not_429(self, tmp_path):
        """The very first scan request (fresh limiter state) must not return 429.

        slowapi uses ``testclient`` as the IP key in ASGI test mode, so
        counters from earlier tests in the same session would bleed into this
        one.  We reset the global limiter storage before making the request so
        this test always starts from zero.
        """
        import backend.security.rate_limiter as rl

        # Reset all rate-limit counters so the next request is definitely "first".
        rl.limiter.reset()

        with _make_client() as client:
            r = client.post(
                "/api/repository/scan",
                json={"path": str(tmp_path), "force": False},
                headers={"X-Forwarded-For": "192.168.100.1"},
            )
            assert r.status_code != 429, (
                f"First request returned 429 unexpectedly: {r.text}"
            )

    def test_health_endpoint_never_rate_limited(self):
        """Health check must never be rate-limited regardless of request count."""
        with _make_client() as client:
            for i in range(200):
                r = client.get(
                    "/health",
                    headers={"X-Forwarded-For": "10.1.0.99"},
                )
                assert r.status_code == 200, (
                    f"Health check returned {r.status_code} at request #{i + 1}"
                )
