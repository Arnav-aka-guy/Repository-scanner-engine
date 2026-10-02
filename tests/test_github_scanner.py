"""Tests for GitHub repository URL validation and cloning security."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.services.github_scanner import validate_github_url


class TestGitHubUrlValidation:
    """Test URL validation constraints for public GitHub repository cloning."""

    def test_valid_urls(self):
        valid = [
            "https://github.com/fastapi/fastapi",
            "https://github.com/fastapi/fastapi.git",
            "https://github.com/python/cpython/",
            "https://github.com/user-name/repo_name.git",
        ]
        for url in valid:
            norm_url, owner, repo = validate_github_url(url)
            assert norm_url.startswith("https://github.com/")
            assert norm_url.endswith(".git")
            assert owner
            assert repo

    def test_reject_insecure_protocols(self):
        insecure = [
            "http://github.com/user/repo",
            "git://github.com/user/repo.git",
            "ssh://git@github.com:user/repo.git",
            "ftp://github.com/user/repo",
            "file:///etc/passwd",
        ]
        for url in insecure:
            with pytest.raises(HTTPException) as exc_info:
                validate_github_url(url)
            assert exc_info.value.status_code == 400

    def test_reject_arbitrary_domains(self):
        bad_domains = [
            "https://gitlab.com/user/repo",
            "https://bitbucket.org/user/repo",
            "https://evil.com/github.com/user/repo",
        ]
        for url in bad_domains:
            with pytest.raises(HTTPException) as exc_info:
                validate_github_url(url)
            assert exc_info.value.status_code == 400

    def test_reject_command_injection_and_flags(self):
        dangerous = [
            "https://github.com/user/repo; rm -rf /",
            "https://github.com/user/repo | whoami",
            "https://github.com/--upload-pack=evil/repo",
            "https://github.com/user/repo\ncat /etc/passwd",
        ]
        for url in dangerous:
            with pytest.raises(HTTPException) as exc_info:
                validate_github_url(url)
            assert exc_info.value.status_code == 400


class TestGitHubScanEndpoint:
    """Test GitHub scan endpoint validation."""

    def test_invalid_url_rejected_by_api(self):
        with TestClient(app) as client:
            resp = client.post(
                "/api/repository/scan-github",
                json={"url": "not-a-url"},
            )
            assert resp.status_code == 400
            assert "Invalid GitHub URL" in resp.json()["detail"]
