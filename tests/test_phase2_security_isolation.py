"""Phase 2 tests: Security, Multi-User Isolation, Database Chat, and APP_MODE profiles."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.rate_limiter import limiter


@pytest.fixture
def client():
    """Create a test client with reset limiter."""
    try:
        limiter.reset()
    except Exception:
        pass
    with TestClient(app) as c:
        yield c


@pytest.fixture
def test_repo_a(tmp_path: Path):
    """Create a temporary repository owned by User A."""
    repo = tmp_path / "user_a_project"
    repo.mkdir(parents=True, exist_ok=True)
    (repo / "app.py").write_text("def run():\n    return 'secret'\n", encoding="utf-8")
    (repo / "requirements.txt").write_text("fastapi==0.115.0\n", encoding="utf-8")
    return repo


def register_user(client: TestClient, name: str) -> dict:
    """Helper to register a user and return auth headers."""
    email = f"{name.lower().replace(' ', '')}_{tempfile.mktemp()[-6:]}@example.com"
    resp = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "SecurePassword123!"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    user_id = resp.json()["user"]["id"]
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user_id": user_id,
        "email": email,
        "token": token,
    }


class TestSecurityHeaders:
    """Verify security headers middleware attaches required protection headers."""

    def test_security_headers_present_on_responses(self, client: TestClient):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Content-Security-Policy" in resp.headers
        assert "default-src 'self'" in resp.headers["Content-Security-Policy"]


class TestAppModeConfiguration:
    """Verify cloud and local mode constraints."""

    def test_cloud_mode_requires_secure_jwt_secret(self):
        from backend.core.config import Settings

        # Insecure secret should fail validation in cloud mode
        with pytest.raises(ValueError, match="APP_MODE=cloud requires a secure JWT_SECRET_KEY"):
            Settings(app_mode="cloud", jwt_secret_key="secret")

        # Short secret (< 32 chars) should fail
        with pytest.raises(ValueError, match="at least 32 characters"):
            Settings(app_mode="cloud", jwt_secret_key="short_secret_123456789012345")

        # Strong secret succeeds and forces auth & db enabled
        strong_secret = "a" * 32
        s = Settings(app_mode="cloud", jwt_secret_key=strong_secret)
        assert s.auth_enabled is True
        assert s.database_enabled is True
        assert s.local_mode is False


class TestUserIsolationAcrossRoutes:
    """Verify User B receives 404 when querying by repository_id, and 403 when querying by path."""

    def test_user_b_receives_404_by_id_across_routes(self, client: TestClient, test_repo_a: Path):
        user_a = register_user(client, "User A")
        user_b = register_user(client, "User B")

        # User A saves repo
        create_resp = client.post(
            "/api/repositories",
            headers=user_a["headers"],
            json={
                "name": "User A Private Repo",
                "source_path": str(test_repo_a),
                "source_type": "local",
            },
        )
        assert create_resp.status_code == 201
        repo_id = create_resp.json()["id"]

        # User B queries User A's repo by repository_id -> must receive 404
        endpoints_with_id = [
            f"/api/repositories/{repo_id}",
            f"/api/graph/dependency?repository_id={repo_id}",
            f"/api/graph/analysis?repository_id={repo_id}",
            f"/api/health-score?repository_id={repo_id}",
            f"/api/tech-debt?repository_id={repo_id}",
            f"/api/dependency-risk?repository_id={repo_id}",
            f"/api/architecture/layers?repository_id={repo_id}",
            f"/api/documentation/export?repository_id={repo_id}",
            f"/api/viz/mermaid?repository_id={repo_id}",
        ]

        for url in endpoints_with_id:
            res = client.get(url, headers=user_b["headers"])
            assert res.status_code == 404, f"Expected 404 for User B on {url}, got {res.status_code}"

    def test_user_b_receives_403_by_path_across_data_routes(self, client: TestClient, test_repo_a: Path):
        user_a = register_user(client, "User A Path")
        user_b = register_user(client, "User B Path")

        # User A saves repo
        create_resp = client.post(
            "/api/repositories",
            headers=user_a["headers"],
            json={
                "name": "User A Path Repo",
                "source_path": str(test_repo_a),
                "source_type": "local",
            },
        )
        assert create_resp.status_code == 201

        # User B tries accessing User A's declared repo path -> 403 Forbidden
        path_str = str(test_repo_a)
        endpoints_with_path = [
            f"/api/graph/dependency?repo_path={path_str}",
            f"/api/health-score?repo_path={path_str}",
            f"/api/tech-debt?repo_path={path_str}",
            f"/api/dependency-risk?repo_path={path_str}",
            f"/api/repository/files?repo_path={path_str}",
            f"/api/chat/history?repo_path={path_str}",
        ]

        for url in endpoints_with_path:
            res = client.get(url, headers=user_b["headers"])
            assert res.status_code == 403, f"Expected 403 for User B on {url}, got {res.status_code}"


class TestSecretsMasking:
    """Verify API keys and secrets are masked in error handlers and responses."""

    def test_mask_secrets_utility(self):
        from backend.api.ai_settings import _mask_secrets

        leaked_err = "OpenAI failed with key sk-1234567890abcdef123456 and Bearer eyJhbGciOiJIUzI1NiJ9"
        masked = _mask_secrets(leaked_err)
        assert "sk-1234567890abcdef123456" not in masked
        assert "[REDACTED]" in masked


class TestRateLimiterUserKeying:
    """Verify rate limiter identifies authenticated user vs remote IP."""

    def test_rate_limiter_extracts_user_id(self):
        from starlette.requests import Request
        from backend.security.rate_limiter import get_user_or_ip
        from backend.security.auth import create_access_token

        # Unauthenticated request falls back to IP
        scope_anon = {"type": "http", "client": ("127.0.0.1", 12345), "headers": []}
        req_anon = Request(scope_anon)
        assert get_user_or_ip(req_anon) == "127.0.0.1"

        # Authenticated request with Bearer token extracts user:ID
        token = create_access_token(data={"sub": "42", "user_id": 42})
        scope_auth = {
            "type": "http",
            "client": ("127.0.0.1", 12345),
            "headers": [(b"authorization", f"Bearer {token}".encode("utf-8"))],
        }
        req_auth = Request(scope_auth)
        assert get_user_or_ip(req_auth) == "user:42"
