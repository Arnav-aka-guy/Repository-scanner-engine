"""Tests for API endpoints using FastAPI TestClient."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _ensure_dist_index():
    """Ensure a minimal frontend/dist/index.html exists for SPA tests in CI."""
    dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    index_file = dist_dir / "index.html"
    created = False
    if not index_file.exists():
        dist_dir.mkdir(parents=True, exist_ok=True)
        index_file.write_text("<!DOCTYPE html><html><body>Test SPA</body></html>", encoding="utf-8")
        created = True
    yield
    if created:
        try:
            index_file.unlink(missing_ok=True)
        except OSError:
            pass


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    from backend.main import app

    with TestClient(app) as c:
        yield c


class TestHealthEndpoints:
    """Test root and health check endpoints."""

    def test_root_returns_status(self, client: TestClient):
        """Root endpoint should return running status."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        assert "version" in data

    def test_health_returns_details(self, client: TestClient):
        """Health endpoint should return provider info."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "llm_provider" in data
        assert "embedding_model" in data

    def test_root_browser_returns_html(self, client: TestClient):
        """Root endpoint with text/html accept header should return HTML when built."""
        response = client.get("/", headers={"Accept": "text/html,application/xhtml+xml"})
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")

    def test_spa_routes_return_html(self, client: TestClient):
        """Client-side SPA routes should return the frontend index HTML."""
        for path in ("/dashboard", "/search", "/chat", "/documentation", "/health-dashboard"):
            response = client.get(path, headers={"Accept": "text/html"})
            assert response.status_code == 200
            assert "text/html" in response.headers.get("content-type", "")

    def test_api_docs_and_health_routing(self, client: TestClient):
        """Verify Swagger UI is at /api/docs and /health returns JSON health check."""
        # /documentation returns SPA HTML
        doc_resp = client.get("/documentation", headers={"Accept": "text/html"})
        assert doc_resp.status_code == 200
        assert "text/html" in doc_resp.headers.get("content-type", "")

        # /health-dashboard returns SPA HTML
        dash_resp = client.get("/health-dashboard", headers={"Accept": "text/html"})
        assert dash_resp.status_code == 200
        assert "text/html" in dash_resp.headers.get("content-type", "")

        # /health returns JSON health check
        health_resp = client.get("/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["status"] == "healthy"

        # /api/docs returns Swagger UI
        swagger_resp = client.get("/api/docs")
        assert swagger_resp.status_code == 200
        assert "text/html" in swagger_resp.headers.get("content-type", "")

    def test_api_404_not_intercepted_by_spa(self, client: TestClient):
        """Unknown API paths must return 404 JSON, not HTML index."""
        response = client.get("/api/unknown_route_12345")
        assert response.status_code == 404
        assert "application/json" in response.headers.get("content-type", "")


class TestRepositoryEndpoints:
    """Test repository scanning and file endpoints."""

    def test_scan_nonexistent_path_returns_400(self, client: TestClient):
        """Scanning a non-existent path should return 400 or 403."""
        response = client.post(
            "/api/repository/scan",
            json={"path": "/nonexistent/fake/path/12345"},
        )
        assert response.status_code in (400, 403)

    def test_list_files_nonexistent_returns_400(self, client: TestClient):
        """Listing files for non-existent path should return error."""
        response = client.get(
            "/api/repository/files",
            params={"repo_path": "/nonexistent/path"},
        )
        assert response.status_code in (400, 403)

    def test_scan_valid_directory(self, client: TestClient, tmp_path):
        """Scanning a valid directory should succeed."""
        # Create a minimal repo
        (tmp_path / "hello.py").write_text("print('hello')")

        response = client.post(
            "/api/repository/scan",
            json={"path": str(tmp_path)},
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_files" in data
        assert data["path"] == str(tmp_path)

    def test_scan_jobs_capped_and_expired_cleaned_up(self):
        """Async scan jobs are capped at 100 and expired jobs older than 1hr are purged."""
        import time
        from backend.api.repository import _scan_jobs, _cleanup_scan_jobs

        _scan_jobs.clear()
        now = time.time()

        # Add an expired finished job (> 1 hour old)
        _scan_jobs["old_done"] = {
            "status": "completed",
            "created_at": now - 3700,
        }
        # Add a recent finished job
        _scan_jobs["recent_done"] = {
            "status": "completed",
            "created_at": now - 10,
        }
        _cleanup_scan_jobs()

        assert "old_done" not in _scan_jobs
        assert "recent_done" in _scan_jobs

        # Test capping at 100
        for i in range(120):
            _scan_jobs[f"job_{i}"] = {
                "status": "pending",
                "created_at": now + i,
            }
        _cleanup_scan_jobs()
        assert len(_scan_jobs) <= 100


class TestSearchEndpoints:
    """Test semantic search endpoints."""

    def test_search_empty_query_rejected(self, client: TestClient):
        """Empty search query should be rejected."""
        response = client.post(
            "/api/search",
            json={"query": "", "top_k": 5},
        )
        assert response.status_code == 422  # Validation error

    def test_search_before_indexing(self, client: TestClient):
        """Search before any indexing should return empty or error."""
        response = client.post(
            "/api/search",
            json={"query": "test function", "top_k": 5},
        )
        # Either empty results or 500 (no index)
        assert response.status_code in (200, 500)


class TestSettingsEndpoints:
    """Test AI settings endpoints."""

    def test_list_providers(self, client: TestClient):
        """Should return list of configured providers."""
        response = client.get("/api/settings/providers")
        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert isinstance(data["providers"], list)


class TestChatEndpoints:
    """Test chat endpoints."""

    def test_chat_history_empty(self, client: TestClient):
        """Chat history should be empty initially."""
        response = client.get("/api/chat/history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
