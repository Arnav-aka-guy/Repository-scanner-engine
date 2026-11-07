"""Regression test suite for Round 2 bug fixes."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.rate_limiter import limiter


@pytest.fixture
def client():
    """Create a test client with rate limiter reset."""
    try:
        limiter.reset()
    except Exception:
        pass
    with TestClient(app) as c:
        yield c


def test_documentation_generate_with_repository_id_only(client: TestClient, tmp_path: Path):
    """A1: POST /api/documentation/generate with only repository_id must succeed (not 500)."""
    repo_dir = tmp_path / "repo_doc_test"
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "main.py").write_text("def run():\n    return 'doc test'\n", encoding="utf-8")

    # Add repository via API
    add_resp = client.post("/api/repositories", json={"name": "doc_test_repo", "source_path": str(repo_dir)})
    assert add_resp.status_code == 201, add_resp.text
    repo_id = add_resp.json()["id"]

    # Call /api/documentation/generate with repository_id and NO repo_path
    resp = client.post("/api/documentation/generate", json={"repository_id": repo_id, "format": "markdown"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["repo_path"] == str(repo_dir)
    assert data["format"] == "markdown"
    assert "docs" in data
