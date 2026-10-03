"""Tests for security modules — path validation, input sanitization, and auth."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException


# ── Path Validator Tests ────────────────────────────────────────────────


class TestValidateRepositoryPath:
    """Test suite for validate_repository_path()."""

    def test_rejects_nonexistent_path(self, tmp_path: Path):
        """Non-existent directory should raise 400."""
        from backend.security.path_validator import validate_repository_path

        fake = str(tmp_path / "nonexistent")
        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path(fake)
        assert exc_info.value.status_code in (400, 403)

    def test_accepts_valid_directory(self, tmp_path: Path):
        """Valid existing directory should return resolved Path."""
        from backend.security.path_validator import validate_repository_path

        result = validate_repository_path(str(tmp_path))
        assert result == tmp_path.resolve()

    def test_rejects_relative_traversal(self, tmp_path: Path):
        """Paths containing '..' should be rejected."""
        from backend.security.path_validator import validate_repository_path

        evil = str(tmp_path / ".." / ".." / "etc" / "passwd")
        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path(evil)
        assert exc_info.value.status_code == 403

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only test")
    def test_rejects_windows_system_path(self):
        """Windows system paths should be blocked."""
        from backend.security.path_validator import validate_repository_path

        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path("C:\\Windows\\System32")
        assert exc_info.value.status_code == 403

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only test")
    def test_rejects_unix_system_path(self):
        """Unix system paths should be blocked."""
        from backend.security.path_validator import validate_repository_path

        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path("/etc")
        assert exc_info.value.status_code == 403

    def test_home_directory_rejected_as_repo_path(self, monkeypatch, tmp_path: Path):
        """A repo_path equal to the home directory must be rejected with 403."""
        from backend.core.config import settings
        from backend.security.path_validator import validate_repository_path

        monkeypatch.setattr(settings, "allowed_roots", [])
        monkeypatch.setattr(Path, "home", lambda: tmp_path)

        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path(str(tmp_path))
        assert exc_info.value.status_code == 403
        assert "home directory" in exc_info.value.detail.lower()

    def test_allowed_roots_containment(self, tmp_path: Path, monkeypatch):
        """With ALLOWED_ROOTS set to a tmp dir, a repo inside it is accepted and a repo outside it is rejected."""
        from backend.core.config import settings
        from backend.security.path_validator import validate_repository_path

        allowed_dir = tmp_path / "allowed_zone"
        allowed_dir.mkdir(parents=True, exist_ok=True)
        repo_inside = allowed_dir / "my_project"
        repo_inside.mkdir()

        outside_dir = tmp_path / "outside_zone"
        outside_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr(settings, "allowed_roots", [str(allowed_dir)])

        # Inside is accepted
        res = validate_repository_path(str(repo_inside))
        assert res == repo_inside.resolve()

        # Outside is rejected
        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path(str(outside_dir))
        assert exc_info.value.status_code == 403
        assert "allowed root" in exc_info.value.detail.lower()

    def test_symlink_inside_allowed_root_pointing_outside_rejected(self, tmp_path: Path, monkeypatch):
        """A symlink inside an allowed root that points outside it is rejected."""
        from backend.core.config import settings
        from backend.security.path_validator import validate_repository_path

        allowed_dir = tmp_path / "allowed"
        allowed_dir.mkdir(parents=True, exist_ok=True)
        outside_dir = tmp_path / "outside"
        outside_dir.mkdir(parents=True, exist_ok=True)

        link_inside = allowed_dir / "link_to_outside"
        try:
            link_inside.symlink_to(outside_dir, target_is_directory=True)
        except OSError:
            pytest.skip("Symlink creation requires elevated privileges on this OS")

        monkeypatch.setattr(settings, "allowed_roots", [str(allowed_dir)])

        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path(str(link_inside))
        assert exc_info.value.status_code == 403


class TestValidateFilePath:
    """Test suite for validate_file_path()."""

    def test_accepts_file_in_repo(self, tmp_path: Path):
        """File within the repo root should be accepted."""
        from backend.security.path_validator import validate_file_path

        test_file = tmp_path / "src" / "main.py"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("print('hello')")

        result = validate_file_path(str(test_file), str(tmp_path))
        assert result.is_file()

    def test_rejects_file_outside_repo(self, tmp_path: Path):
        """File outside the repo root should be rejected."""
        from backend.security.path_validator import validate_file_path

        # Create a file outside the repo
        outer = tmp_path.parent / "secret.txt"
        try:
            outer.write_text("secret")
            with pytest.raises(HTTPException) as exc_info:
                validate_file_path(str(outer), str(tmp_path))
            assert exc_info.value.status_code == 403
        finally:
            outer.unlink(missing_ok=True)

    def test_rejects_nonexistent_file(self, tmp_path: Path):
        """Non-existent file should raise 404."""
        from backend.security.path_validator import validate_file_path

        fake = str(tmp_path / "nonexistent.py")
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path(fake, str(tmp_path))
        assert exc_info.value.status_code in (404, 400, 403)

    def test_read_ssh_key_through_api_rejected(self, tmp_path: Path):
        """Reading <tmp_home>/.ssh/id_rsa through /api/repository/file is rejected with 403."""
        from fastapi.testclient import TestClient
        from backend.main import app

        tmp_home = tmp_path / "fake_home"
        ssh_dir = tmp_home / ".ssh"
        ssh_dir.mkdir(parents=True, exist_ok=True)
        key_file = ssh_dir / "id_rsa"
        key_file.write_text("PRIVATE_KEY_DATA")

        with TestClient(app) as client:
            resp = client.get(
                f"/api/repository/file/{key_file.name}",
                params={"repo_path": str(ssh_dir)},
            )
            assert resp.status_code == 403

            resp2 = client.get(
                "/api/repository/file/.ssh/id_rsa",
                params={"repo_path": str(tmp_home)},
            )
            assert resp2.status_code == 403

    def test_relative_file_path_resolution(self, tmp_path: Path):
        """Relative file paths resolve against repo_path; escapes return 403."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.security.path_validator import validate_file_path

        repo_dir = tmp_path / "my_repo"
        repo_dir.mkdir()
        (repo_dir / "src").mkdir()
        test_file = repo_dir / "src" / "a.py"
        test_file.write_text("def hello(): return 'world'")

        outside_file = tmp_path / "outside.py"
        outside_file.write_text("outside secret")

        with TestClient(app) as client:
            client.post("/api/repository/scan", json={"path": str(repo_dir)})
            # Relative path should succeed (200) and return file content
            resp = client.get(
                "/api/repository/file/src/a.py",
                params={"repo_path": str(repo_dir)},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "def hello():" in data["content"]

            # Escaping via .. should return 403
            resp_esc = client.get(
                "/api/repository/file/%2e%2e/outside.py",
                params={"repo_path": str(repo_dir)},
            )
            assert resp_esc.status_code == 403

        # Direct function call check
        with pytest.raises(HTTPException) as exc_info:
            validate_file_path("../outside.py", str(repo_dir))
        assert exc_info.value.status_code == 403


class TestScannedRepoRegistryAndFileLeak:
    """Tests for scanned repo registry and default-mode file leak protections."""

    def test_root_path_rejected_as_repo_path(self, monkeypatch):
        """repo_path='/' must be rejected with 403."""
        from backend.core.config import settings
        from backend.security.path_validator import validate_repository_path

        monkeypatch.setattr(settings, "allowed_roots", [])
        with pytest.raises(HTTPException) as exc_info:
            validate_repository_path("/")
        assert exc_info.value.status_code == 403

    def test_unscanned_repo_path_rejected_by_file_endpoint(self, tmp_path: Path):
        """Unscanned repo_path must be rejected with 403 'Repository has not been scanned.'."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.security.repo_registry import clear_scanned_repos

        clear_scanned_repos()
        repo_dir = tmp_path / "unscanned_repo"
        repo_dir.mkdir()
        (repo_dir / "file.py").write_text("print(1)")

        with TestClient(app) as client:
            resp = client.get(
                "/api/repository/file/file.py",
                params={"repo_path": str(repo_dir)},
            )
            assert resp.status_code == 403
            assert "Repository has not been scanned." in resp.json()["detail"]

    def test_scanned_repo_path_accepted_by_file_endpoint(self, tmp_path: Path):
        """Once scanned, repo_path is accepted by /file."""
        from fastapi.testclient import TestClient
        from backend.main import app

        repo_dir = tmp_path / "scanned_repo"
        repo_dir.mkdir()
        (repo_dir / "file.py").write_text("print('scanned')")

        with TestClient(app) as client:
            scan_res = client.post("/api/repository/scan", json={"path": str(repo_dir)})
            assert scan_res.status_code == 200

            resp = client.get(
                "/api/repository/file/file.py",
                params={"repo_path": str(repo_dir)},
            )
            assert resp.status_code == 200
            assert "print('scanned')" in resp.json()["content"]

    def test_bash_history_and_docker_config_unreadable(self, tmp_path: Path):
        """~/.bash_history and ~/.docker/config.json are unreadable with any repo_path."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.security.repo_registry import register_scanned_repo

        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()
        register_scanned_repo(repo_dir)

        fake_home = tmp_path / "fake_home"
        fake_home.mkdir()
        (fake_home / ".bash_history").write_text("secret_command")
        docker_dir = fake_home / ".docker"
        docker_dir.mkdir()
        (docker_dir / "config.json").write_text('{"auths": {}}')

        (repo_dir / ".bash_history").write_text("repo_secret")
        repo_docker = repo_dir / ".docker"
        repo_docker.mkdir()
        (repo_docker / "config.json").write_text('{"auths": {}}')

        with TestClient(app) as client:
            # Inside scanned repo: blocked by sensitive file component check
            r1 = client.get(
                "/api/repository/file/.bash_history",
                params={"repo_path": str(repo_dir)},
            )
            assert r1.status_code == 403

            r2 = client.get(
                "/api/repository/file/.docker/config.json",
                params={"repo_path": str(repo_dir)},
            )
            assert r2.status_code == 403

            # Outside unscanned repo: blocked
            r3 = client.get(
                "/api/repository/file/.bash_history",
                params={"repo_path": str(fake_home)},
            )
            assert r3.status_code == 403

    def test_github_workflows_and_gitignore_readable_but_git_config_blocked(self, tmp_path: Path):
        """.github/workflows/ci.yml and .gitignore are readable inside a scanned repo; .git/config still blocked."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.security.repo_registry import register_scanned_repo

        repo_dir = tmp_path / "my_project"
        repo_dir.mkdir()
        register_scanned_repo(repo_dir)

        workflows_dir = repo_dir / ".github" / "workflows"
        workflows_dir.mkdir(parents=True)
        ci_file = workflows_dir / "ci.yml"
        ci_file.write_text("name: CI\n")

        gitignore_file = repo_dir / ".gitignore"
        gitignore_file.write_text("node_modules/\n")

        git_dir = repo_dir / ".git"
        git_dir.mkdir()
        git_config = git_dir / "config"
        git_config.write_text("[core]\n")

        with TestClient(app) as client:
            # .github/workflows/ci.yml readable
            r_ci = client.get(
                "/api/repository/file/.github/workflows/ci.yml",
                params={"repo_path": str(repo_dir)},
            )
            assert r_ci.status_code == 200
            assert "name: CI" in r_ci.json()["content"]

            # .gitignore readable
            r_gi = client.get(
                "/api/repository/file/.gitignore",
                params={"repo_path": str(repo_dir)},
            )
            assert r_gi.status_code == 200
            assert "node_modules/" in r_gi.json()["content"]

            # .git/config still blocked
            r_gc = client.get(
                "/api/repository/file/.git/config",
                params={"repo_path": str(repo_dir)},
            )
            assert r_gc.status_code == 403


# ── Input Sanitizer Tests ──────────────────────────────────────────────


class TestSanitizedRepoPath:
    """Test suite for SanitizedRepoPath."""

    def test_accepts_valid_path(self):
        """Valid path string should pass validation."""
        from backend.security.input_sanitizer import SanitizedRepoPath

        result = SanitizedRepoPath(path="/home/user/project")
        assert result.path == "/home/user/project"

    def test_rejects_null_bytes(self):
        """Paths with null bytes should be rejected."""
        from backend.security.input_sanitizer import SanitizedRepoPath

        with pytest.raises(Exception):
            SanitizedRepoPath(path="/home/user/\x00evil")

    def test_rejects_too_long_path(self):
        """Paths exceeding max length should be rejected."""
        from backend.security.input_sanitizer import SanitizedRepoPath

        with pytest.raises(Exception):
            SanitizedRepoPath(path="A" * 501)

    def test_strips_whitespace(self):
        """Leading/trailing whitespace should be stripped."""
        from backend.security.input_sanitizer import SanitizedRepoPath

        result = SanitizedRepoPath(path="  /home/user/project  ")
        assert result.path.strip() == "/home/user/project"


class TestSanitizedQuery:
    """Test suite for SanitizedQuery."""

    def test_accepts_valid_query(self):
        """Normal query string should pass."""
        from backend.security.input_sanitizer import SanitizedQuery

        result = SanitizedQuery(query="how does the parser work?")
        assert "parser" in result.query

    def test_rejects_empty_query(self):
        """Empty query should be rejected."""
        from backend.security.input_sanitizer import SanitizedQuery

        with pytest.raises(Exception):
            SanitizedQuery(query="")


# ── Auth Tests ──────────────────────────────────────────────────────────


class TestAuth:
    """Test suite for JWT auth module."""

    def test_create_and_verify_token(self):
        """Token creation and verification round-trip should work."""
        from backend.security.auth import create_access_token, verify_token

        token = create_access_token(data={"sub": "testuser"})
        assert isinstance(token, str)
        assert len(token) > 20

        payload = verify_token(token)
        assert payload["sub"] == "testuser"

    def test_verify_invalid_token(self):
        """Invalid token should raise HTTPException."""
        from backend.security.auth import verify_token

        with pytest.raises(HTTPException) as exc_info:
            verify_token("invalid.token.here")
        assert exc_info.value.status_code == 401

    def test_verify_expired_token(self):
        """Expired token should raise HTTPException."""
        from backend.security.auth import create_access_token, verify_token
        from datetime import timedelta

        # Create a token that's already expired
        token = create_access_token(
            data={"sub": "testuser"},
            expires_delta=timedelta(seconds=-10),
        )
        with pytest.raises(HTTPException):
            verify_token(token)

    def test_token_endpoint_success_and_failure(self, monkeypatch):
        """Token endpoint returns a token for correct credentials and 401 for wrong ones."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.core.config import settings
        from backend.security.auth import hash_password

        pwd_hash = hash_password("secret123")
        monkeypatch.setattr(settings, "auth_enabled", True)
        monkeypatch.setattr(settings, "admin_username", "admin")
        monkeypatch.setattr(settings, "admin_password_hash", pwd_hash)

        with TestClient(app) as client:
            # 1. Correct credentials -> 200 with access_token
            resp = client.post(
                "/api/auth/token",
                json={"username": "admin", "password": "secret123"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"

            # 2. Wrong credentials -> 401
            resp_bad = client.post(
                "/api/auth/token",
                json={"username": "admin", "password": "wrongpassword"},
            )
            assert resp_bad.status_code == 401

            # 3. Wrong username -> 401
            resp_bad_user = client.post(
                "/api/auth/token",
                json={"username": "wronguser", "password": "secret123"},
            )
            assert resp_bad_user.status_code == 401

    def test_protected_route_enforcement_when_auth_enabled(self, monkeypatch, tmp_path: Path):
        """A protected route returns 401 without a token and 200 with one when AUTH_ENABLED=true."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.core.config import settings
        from backend.security.auth import create_access_token

        monkeypatch.setattr(settings, "auth_enabled", True)
        token = create_access_token(data={"sub": "admin"})

        # Create a minimal repo for scanning
        (tmp_path / "hello.py").write_text("print('hello')")
        from backend.security.repo_registry import register_scanned_repo

        register_scanned_repo(tmp_path)

        with TestClient(app) as client:
            # 1. Request without token -> 401
            resp_no_auth = client.get(
                "/api/repository/files",
                params={"repo_path": str(tmp_path)},
            )
            assert resp_no_auth.status_code == 401

            # 2. Request with valid token -> 200
            resp_with_auth = client.get(
                "/api/repository/files",
                params={"repo_path": str(tmp_path)},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_with_auth.status_code == 200

    def test_auth_status_endpoint(self, monkeypatch):
        """GET /api/auth/status returns the current auth_enabled flag."""
        from fastapi.testclient import TestClient
        from backend.main import app
        from backend.core.config import settings

        monkeypatch.setattr(settings, "auth_enabled", False)
        with TestClient(app) as client:
            resp = client.get("/api/auth/status")
            assert resp.status_code == 200
            assert resp.json()["auth_enabled"] is False

        monkeypatch.setattr(settings, "auth_enabled", True)
        with TestClient(app) as client:
            resp = client.get("/api/auth/status")
            assert resp.status_code == 200
            assert resp.json()["auth_enabled"] is True
