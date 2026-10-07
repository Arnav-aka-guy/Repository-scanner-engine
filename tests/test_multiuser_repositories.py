"""Comprehensive tests for multi-user authentication, repository quotas, and user isolation."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_repo(tmp_path: Path):
    """Create a temporary valid git-like repository directory for testing."""
    repo_dir = tmp_path / "sample_project"
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "main.py").write_text("def hello():\n    return 'world'\n", encoding="utf-8")
    (repo_dir / "utils.py").write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
    return repo_dir


class TestMultiUserAuth:
    """User registration, login, and profile tests."""

    def test_user_registration_success(self, client: TestClient):
        email = f"user_{tempfile.mktemp()[-6:]}@example.com"
        resp = client.post(
            "/api/auth/register",
            json={"name": "Alice Dev", "email": email, "password": "securepassword123"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["name"] == "Alice Dev"
        assert data["user"]["email"] == email.lower()
        assert data["user"]["repository_count"] == 0
        assert data["user"]["max_repositories"] == 5

    def test_duplicate_email_registration_rejected(self, client: TestClient):
        email = f"duplicate_{tempfile.mktemp()[-6:]}@example.com"
        resp1 = client.post(
            "/api/auth/register",
            json={"name": "First User", "email": email, "password": "securepassword123"},
        )
        assert resp1.status_code == 200

        resp2 = client.post(
            "/api/auth/register",
            json={"name": "Second User", "email": email, "password": "anotherpassword456"},
        )
        assert resp2.status_code == 409
        assert "already exists" in resp2.json()["detail"]

    def test_short_password_rejected(self, client: TestClient):
        email = f"shortpw_{tempfile.mktemp()[-6:]}@example.com"
        resp = client.post(
            "/api/auth/register",
            json={"name": "User", "email": email, "password": "123"},
        )
        assert resp.status_code in (400, 422)

    def test_user_login_success(self, client: TestClient):
        email = f"login_{tempfile.mktemp()[-6:]}@example.com"
        password = "mySecretPassword123"
        client.post(
            "/api/auth/register",
            json={"name": "Bob Dev", "email": email, "password": password},
        )

        resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == email.lower()

    def test_login_invalid_credentials_rejected(self, client: TestClient):
        email = f"wrongpw_{tempfile.mktemp()[-6:]}@example.com"
        client.post(
            "/api/auth/register",
            json={"name": "User", "email": email, "password": "correctPassword123"},
        )

        resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrongPassword!!!"},
        )
        assert resp.status_code == 401
        assert "Incorrect email or password" in resp.json()["detail"]

    def test_me_requires_authentication(self, client: TestClient):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestRepositoryQuotaAndManagement:
    """Tests for repository CRUD and the maximum 5 repositories ceiling."""

    @pytest.fixture
    def auth_headers(self, client: TestClient):
        email = f"quota_{tempfile.mktemp()[-6:]}@example.com"
        resp = client.post(
            "/api/auth/register",
            json={"name": "Quota Tester", "email": email, "password": "password12345"},
        )
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_list_empty_repositories(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/repositories", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 0
        assert data["max_limit"] == 5
        assert data["available_slots"] == 5
        assert data["repositories"] == []

    def test_create_and_get_repository(self, client: TestClient, auth_headers: dict, sample_repo: Path):
        resp = client.post(
            "/api/repositories",
            headers=auth_headers,
            json={
                "name": "Sample Repo 1",
                "source_path": str(sample_repo),
                "source_type": "local",
                "description": "My first repo",
            },
        )
        assert resp.status_code == 201
        repo = resp.json()
        assert repo["name"] == "Sample Repo 1"
        assert repo["status"] == "CREATED"
        repo_id = repo["id"]

        # Fetch detail
        get_resp = client.get(f"/api/repositories/{repo_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == repo_id

    def test_max_five_repositories_enforced(self, client: TestClient, auth_headers: dict, tmp_path: Path):
        """Verify user can add up to 5 repositories, and the 6th is rejected server-side."""
        repo_ids = []
        for i in range(5):
            repo_dir = tmp_path / f"repo_{i}"
            repo_dir.mkdir(parents=True, exist_ok=True)
            (repo_dir / "index.js").write_text("console.log('hi');", encoding="utf-8")
            resp = client.post(
                "/api/repositories",
                headers=auth_headers,
                json={
                    "name": f"Repo {i+1}",
                    "source_path": str(repo_dir),
                    "source_type": "local",
                },
            )
            assert resp.status_code == 201, f"Failed at repo {i+1}: {resp.text}"
            repo_ids.append(resp.json()["id"])

        # Check quota is full
        list_resp = client.get("/api/repositories", headers=auth_headers)
        assert list_resp.status_code == 200
        assert list_resp.json()["count"] == 5
        assert list_resp.json()["available_slots"] == 0

        # Attempt to add a 6th repository -> MUST FAIL with 400
        repo_6_dir = tmp_path / "repo_6"
        repo_6_dir.mkdir(parents=True, exist_ok=True)
        (repo_6_dir / "app.py").write_text("# six", encoding="utf-8")
        resp_sixth = client.post(
            "/api/repositories",
            headers=auth_headers,
            json={
                "name": "Repo 6",
                "source_path": str(repo_6_dir),
                "source_type": "local",
            },
        )
        assert resp_sixth.status_code == 400
        assert "maximum limit of 5" in resp_sixth.json()["detail"].lower()

        # Delete one repository
        del_resp = client.delete(f"/api/repositories/{repo_ids[0]}", headers=auth_headers)
        assert del_resp.status_code == 200

        # Now 6th can be added
        resp_retry = client.post(
            "/api/repositories",
            headers=auth_headers,
            json={
                "name": "Repo 6 (retry)",
                "source_path": str(repo_6_dir),
                "source_type": "local",
            },
        )
        assert resp_retry.status_code == 201


class TestUserDataIsolation:
    """Verify User A cannot access, modify, delete, or inspect User B's repositories or files."""

    def test_user_b_cannot_access_user_a_repository(self, client: TestClient, tmp_path: Path):
        # Register User A
        email_a = f"usera_{tempfile.mktemp()[-6:]}@example.com"
        resp_a = client.post(
            "/api/auth/register",
            json={"name": "User A", "email": email_a, "password": "passwordA123"},
        )
        token_a = resp_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Register User B
        email_b = f"userb_{tempfile.mktemp()[-6:]}@example.com"
        resp_b = client.post(
            "/api/auth/register",
            json={"name": "User B", "email": email_b, "password": "passwordB123"},
        )
        token_b = resp_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates a repository
        repo_a_dir = tmp_path / "repo_a"
        repo_a_dir.mkdir(parents=True, exist_ok=True)
        (repo_a_dir / "secret_code.py").write_text("SECRET_A = 42\n", encoding="utf-8")

        create_resp = client.post(
            "/api/repositories",
            headers=headers_a,
            json={
                "name": "Private Project A",
                "source_path": str(repo_a_dir),
                "source_type": "local",
            },
        )
        assert create_resp.status_code == 201
        repo_a_id = create_resp.json()["id"]

        # 1. User B tries to GET User A's repository details -> 404
        get_b = client.get(f"/api/repositories/{repo_a_id}", headers=headers_b)
        assert get_b.status_code == 404

        # 2. User B tries to PATCH User A's repository -> 404
        patch_b = client.patch(
            f"/api/repositories/{repo_a_id}",
            headers=headers_b,
            json={"name": "Hacked Repo"},
        )
        assert patch_b.status_code == 404

        # 3. User B tries to DELETE User A's repository -> 404
        del_b = client.delete(f"/api/repositories/{repo_a_id}", headers=headers_b)
        assert del_b.status_code == 404

        # 4. User B tries to read User A's repository files -> 403 Forbidden
        files_b = client.get(
            f"/api/repository/files?repo_path={repo_a_dir}",
            headers=headers_b,
        )
        assert files_b.status_code == 403

        file_content_b = client.get(
            f"/api/repository/file/secret_code.py?repo_path={repo_a_dir}",
            headers=headers_b,
        )
        assert file_content_b.status_code == 403

        # 5. User B tries to search User A's repository -> 403 Forbidden
        search_b = client.post(
            "/api/search",
            headers=headers_b,
            json={"query": "SECRET_A", "repo_path": str(repo_a_dir)},
        )
        assert search_b.status_code == 403
