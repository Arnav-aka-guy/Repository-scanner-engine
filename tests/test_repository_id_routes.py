"""Regression test suite for repository ID route resolution and dependency graph."""

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
    import contextlib

    with contextlib.suppress(Exception):
        limiter.reset()
    with TestClient(app) as c:
        yield c


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


def test_documentation_generate_with_repository_id_only(client: TestClient, tmp_path: Path):
    """POST /api/documentation/generate with only repository_id must succeed (not 500)."""
    user = register_user(client, "Doc User")
    repo_dir = tmp_path / "repo_doc_test"
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "main.py").write_text("def run():\n    return 'doc test'\n", encoding="utf-8")

    # Add repository via API
    add_resp = client.post(
        "/api/repositories",
        json={"name": "doc_test_repo", "source_path": str(repo_dir)},
        headers=user["headers"],
    )
    assert add_resp.status_code == 201, add_resp.text
    repo_id = add_resp.json()["id"]

    # Call /api/documentation/generate with repository_id and NO repo_path
    resp = client.post(
        "/api/documentation/generate",
        json={"repository_id": repo_id, "format": "markdown"},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["repo_path"] == str(repo_dir)
    assert data["format"] == "markdown"
    assert "docs" in data


def test_endpoints_accept_repository_id_only(client: TestClient, tmp_path: Path):
    """Verify onboarding, architecture report, impact analyze/export, and review analyze accept repository_id only."""
    user = register_user(client, "Scoped User")
    repo_dir = tmp_path / "repo_scoped_test"
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "main.py").write_text("def run():\n    return 'test'\n", encoding="utf-8")

    add_resp = client.post(
        "/api/repositories",
        json={"name": "scoped_test_repo", "source_path": str(repo_dir)},
        headers=user["headers"],
    )
    assert add_resp.status_code == 201, add_resp.text
    repo_id = add_resp.json()["id"]

    # 1. GET /api/repository/onboarding?repository_id=...
    resp_onboarding = client.get(
        f"/api/repository/onboarding?repository_id={repo_id}",
        headers=user["headers"],
    )
    assert resp_onboarding.status_code == 200, resp_onboarding.text
    assert "purpose" in resp_onboarding.json()

    # 2. POST /api/architecture/report
    resp_arch = client.post(
        "/api/architecture/report",
        json={"repository_id": repo_id},
        headers=user["headers"],
    )
    assert resp_arch.status_code == 200, resp_arch.text
    assert "score" in resp_arch.json()

    # 3. POST /api/impact/analyze
    resp_impact = client.post(
        "/api/impact/analyze",
        json={"repository_id": repo_id, "target_files": ["main.py"]},
        headers=user["headers"],
    )
    assert resp_impact.status_code == 200, resp_impact.text
    assert "risk_score" in resp_impact.json()

    # 3b. POST /api/impact/analyze with non-existent file returns 404
    resp_impact_404 = client.post(
        "/api/impact/analyze",
        json={"repository_id": repo_id, "target_files": ["backend/nope.py"]},
        headers=user["headers"],
    )
    assert resp_impact_404.status_code == 404, resp_impact_404.text
    assert "File not found in this repository: backend/nope.py" in resp_impact_404.json()["detail"]

    # 4. POST /api/impact/export
    resp_export = client.post(
        "/api/impact/export?format=markdown",
        json={"repository_id": repo_id, "target_files": ["main.py"]},
        headers=user["headers"],
    )
    assert resp_export.status_code == 200, resp_export.text

    # 5. POST /api/review/analyze
    resp_review = client.post(
        "/api/review/analyze",
        json={"repository_id": repo_id},
        headers=user["headers"],
    )
    assert resp_review.status_code == 200, resp_review.text
    assert "total_findings" in resp_review.json()


def test_endpoints_user_isolation(client: TestClient, tmp_path: Path, monkeypatch):
    """User Isolation: User B receives 404/403 when accessing User A's repository_id across routes."""
    from backend.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "local_mode", False)

    user_a = register_user(client, "User A")
    user_b = register_user(client, "User B")

    repo_dir = tmp_path / "repo_isolated_a"
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / "main.py").write_text("def user_a(): pass\n", encoding="utf-8")

    add_resp = client.post(
        "/api/repositories",
        json={"name": "user_a_repo", "source_path": str(repo_dir)},
        headers=user_a["headers"],
    )
    assert add_resp.status_code == 201, add_resp.text
    repo_a_id = add_resp.json()["id"]

    # User B tries GET /api/repository/onboarding with User A's ID
    resp_onboarding = client.get(
        f"/api/repository/onboarding?repository_id={repo_a_id}",
        headers=user_b["headers"],
    )
    assert resp_onboarding.status_code in (403, 404), resp_onboarding.text

    # User B tries POST /api/architecture/report with User A's ID
    resp_arch = client.post(
        "/api/architecture/report",
        json={"repository_id": repo_a_id},
        headers=user_b["headers"],
    )
    assert resp_arch.status_code in (403, 404), resp_arch.text

    # User B tries POST /api/impact/analyze with User A's ID
    resp_impact = client.post(
        "/api/impact/analyze",
        json={"repository_id": repo_a_id, "target_files": ["main.py"]},
        headers=user_b["headers"],
    )
    assert resp_impact.status_code in (403, 404), resp_impact.text

    # User B tries POST /api/impact/export with User A's ID
    resp_export = client.post(
        "/api/impact/export?format=markdown",
        json={"repository_id": repo_a_id, "target_files": ["main.py"]},
        headers=user_b["headers"],
    )
    assert resp_export.status_code in (403, 404), resp_export.text

    # User B tries POST /api/review/analyze with User A's ID
    resp_review = client.post(
        "/api/review/analyze",
        json={"repository_id": repo_a_id},
        headers=user_b["headers"],
    )
    assert resp_review.status_code in (403, 404), resp_review.text


def test_ts_js_file_dependency_resolution():
    """A5: File dependency graph creates edges for TypeScript/JavaScript relative specifiers, index files, and path aliases, while skipping external packages."""
    from backend.graph.builder import GraphBuilder
    from backend.parser.models import ImportInfo, ParsedFile

    parsed_files = {
        "src/index.ts": ParsedFile(
            file_path="src/index.ts",
            imports=[
                ImportInfo(module="./components/Button"),
                ImportInfo(module="./components"),
                ImportInfo(module="@/utils"),
                ImportInfo(module="react"),
                ImportInfo(module="@tanstack/react-query"),
            ],
        ),
        "src/components/Button.tsx": ParsedFile(file_path="src/components/Button.tsx"),
        "src/components/index.ts": ParsedFile(file_path="src/components/index.ts"),
        "src/utils.ts": ParsedFile(file_path="src/utils.ts"),
    }

    builder = GraphBuilder()
    g = builder.build_dependency_graph(parsed_files)

    # Asserts that edges are created for every local import and none for external libraries
    assert ("src/index.ts", "src/components/Button.tsx") in g.edges
    assert ("src/index.ts", "src/components/index.ts") in g.edges
    assert ("src/index.ts", "src/utils.ts") in g.edges
    assert len(g.edges) == 3

    # Also test with Windows absolute paths
    parsed_files_win = {
        r"C:\code\repo\src\index.ts": ParsedFile(
            file_path=r"C:\code\repo\src\index.ts",
            imports=[
                ImportInfo(module="./components/Button"),
                ImportInfo(module="./components"),
                ImportInfo(module="@/utils"),
                ImportInfo(module="react"),
            ],
        ),
        r"C:\code\repo\src\components\Button.tsx": ParsedFile(file_path=r"C:\code\repo\src\components\Button.tsx"),
        r"C:\code\repo\src\components\index.ts": ParsedFile(file_path=r"C:\code\repo\src\components\index.ts"),
        r"C:\code\repo\src\utils.ts": ParsedFile(file_path=r"C:\code\repo\src\utils.ts"),
    }
    g_win = builder.build_dependency_graph(parsed_files_win)
    assert (r"C:\code\repo\src\index.ts", r"C:\code\repo\src\components\Button.tsx") in g_win.edges
    assert (r"C:\code\repo\src\index.ts", r"C:\code\repo\src\components\index.ts") in g_win.edges
    assert (r"C:\code\repo\src\index.ts", r"C:\code\repo\src\utils.ts") in g_win.edges
    assert len(g_win.edges) == 3
