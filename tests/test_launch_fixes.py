"""Regression tests for the pre-launch backend fixes."""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.core.config import get_settings
from backend.main import app
from backend.parser.scanner import RepositoryScanner

# ── Scanner: symlinks may not leak files from outside the repository ─────────


@pytest.mark.skipif(os.name == "nt", reason="symlinks need extra rights on Windows")
def test_scanner_skips_symlinked_files_pointing_outside_repo(tmp_path: Path) -> None:
    secret = tmp_path / "server_secret.py"
    secret.write_text("API_KEY = 'do-not-leak'\n")
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "real.py").write_text("def ok():\n    return 1\n")
    (repo / "inside_link.py").symlink_to(repo / "real.py")
    (repo / "leak.py").symlink_to(secret)

    names = {Path(f.path).name for f in RepositoryScanner().get_files(str(repo))}
    assert "real.py" in names
    assert "inside_link.py" in names  # links that stay inside the repo are fine
    assert "leak.py" not in names


# ── Scan jobs: one system, real cancel, status recovery ──────────────────────


def _slow_parser() -> MagicMock:
    parser = MagicMock()

    async def slow_scan(_path: str):
        await asyncio.sleep(30)

    parser.scan_repository = slow_scan
    parser.invalidate_cache = MagicMock()
    return parser


@pytest.mark.asyncio
async def test_cancel_stops_the_running_task(tmp_path: Path) -> None:
    from backend.services.scan_worker import ScanJobManager

    manager = ScanJobManager()
    job = await manager.create_scan_job(str(tmp_path), _slow_parser(), MagicMock())
    task = manager._running_tasks[job["job_id"]]
    await asyncio.sleep(0.05)

    cancelled = await manager.cancel_job(job["job_id"])
    assert cancelled["status"] == "cancelled"
    assert task.done()
    assert manager.get_active_job_for_path(str(tmp_path)) is None


@pytest.mark.asyncio
async def test_second_scan_of_same_repo_reuses_running_job(tmp_path: Path) -> None:
    from backend.services.scan_worker import ScanJobManager

    manager = ScanJobManager()
    first = await manager.create_scan_job(str(tmp_path), _slow_parser(), MagicMock())
    second = await manager.create_scan_job(str(tmp_path), _slow_parser(), MagicMock())
    assert first["job_id"] == second["job_id"]
    await manager.cancel_job(first["job_id"])


@pytest.mark.asyncio
async def test_listing_jobs_does_not_mark_running_job_failed(tmp_path: Path) -> None:
    from backend.services.scan_worker import ScanJobManager

    manager = ScanJobManager()
    job = await manager.create_scan_job(str(tmp_path), _slow_parser(), MagicMock())
    manager.list_jobs()
    manager.get_job(job["job_id"])
    assert manager.get_job(job["job_id"])["status"] in ("pending", "scanning")
    await manager.cancel_job(job["job_id"])


def test_interrupted_jobs_are_recovered_on_load(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.storage import persistence

    monkeypatch.setattr(persistence, "_get_jobs_path", lambda: str(tmp_path / "jobs.json"))
    for status in ("scanning", "indexing", "pending"):
        persistence.save_scan_job(status, {"job_id": status, "status": status, "created_at": 0})
    jobs = persistence.load_scan_jobs(recover_interrupted=True)
    assert {j["status"] for j in jobs.values()} == {"failed"}


@pytest.mark.asyncio
async def test_github_rescan_pulls_before_scanning(tmp_path: Path) -> None:
    from backend.services.scan_worker import ScanJobManager

    repo = tmp_path / "owner_repo_abc"
    repo.mkdir()
    (repo / "a.py").write_text("x = 1\n")
    from backend.parser.service import ParserService

    embeddings = MagicMock()
    embeddings.index_repository = AsyncMock(return_value=1)
    manager = ScanJobManager()
    with patch("backend.services.github_scanner.clone_github_repo") as clone:
        job = await manager.create_scan_job(
            str(repo), ParserService(), embeddings, github_url="https://github.com/owner/repo"
        )
        await manager._running_tasks[job["job_id"]]
    clone.assert_called_once()
    assert manager.get_job(job["job_id"])["status"] == "completed"


@pytest.mark.asyncio
async def test_search_index_failure_does_not_fail_whole_scan(tmp_path: Path) -> None:
    from backend.parser.service import ParserService
    from backend.services.scan_worker import ScanJobManager

    (tmp_path / "a.py").write_text("def f():\n    return 1\n")
    embeddings = MagicMock()
    embeddings.index_repository = AsyncMock(side_effect=RuntimeError("model missing"))
    manager = ScanJobManager()
    job = await manager.create_scan_job(str(tmp_path), ParserService(), embeddings)
    await manager._running_tasks[job["job_id"]]
    done = manager.get_job(job["job_id"])
    assert done["status"] == "completed"
    assert done["warning"]


# ── Endpoints ─────────────────────────────────────────────────────────────────


def test_browse_folder_blocked_when_hosted(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "app_mode", "cloud")
    with TestClient(app) as client:
        resp = client.post("/api/repository/browse-folder")
        # cloud mode requires auth, so either unauthorized or forbidden, never a dialog
        assert resp.status_code in (401, 403)


def test_auth_status_reports_capabilities() -> None:
    with TestClient(app) as client:
        data = client.get("/api/auth/status").json()
    assert set(data) >= {"auth_enabled", "password_reset_email", "folder_picker", "ai_daily_limit"}


def test_ai_daily_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.security.ai_quota import consume_ai_request, remaining_ai_requests, reset_ai_quota

    reset_ai_quota()
    monkeypatch.setattr(get_settings(), "ai_daily_limit_per_user", 2)
    user = {"auth": True, "user_id": 7}
    consume_ai_request(user)
    consume_ai_request(user)
    assert remaining_ai_requests(user) == 0
    with pytest.raises(HTTPException) as exc:
        consume_ai_request(user)
    assert exc.value.status_code == 429
    consume_ai_request({"auth": True, "user_id": 8})  # other users are not affected
    reset_ai_quota()


def test_ai_daily_limit_off_by_default() -> None:
    from backend.security.ai_quota import consume_ai_request, remaining_ai_requests

    for _ in range(50):
        consume_ai_request(None)
    assert remaining_ai_requests(None) is None


def test_password_reset_sends_email_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from", "noreply@example.com")
    fake_user = MagicMock(id=1, email="a@example.com", token_version=1)
    with (
        patch("backend.api.auth.get_user_by_email", AsyncMock(return_value=fake_user)),
        patch("backend.services.mailer.send_password_reset") as send,
        TestClient(app) as client,
    ):
        resp = client.post("/api/auth/forgot-password", json={"email": "a@example.com"})
    assert resp.status_code == 200
    send.assert_called_once()
    assert "/reset-password?token=" in send.call_args.args[1]


# ── Code review picks the right diff ──────────────────────────────────────────


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.mark.skipif(subprocess.run(["git", "--version"], capture_output=True).returncode != 0, reason="git missing")
def test_working_tree_diff_prefers_uncommitted_then_last_commit(tmp_path: Path) -> None:
    from backend.api.code_review import _working_tree_diff

    diff, source = _working_tree_diff(str(tmp_path))
    assert diff == "" and "not a git repository" in source

    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "t@t")
    _git(tmp_path, "config", "user.name", "t")
    (tmp_path / "a.py").write_text("x = 1\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "first")

    diff, source = _working_tree_diff(str(tmp_path))  # single commit, nothing uncommitted
    assert "a.py" in diff and source == "the latest commit"

    (tmp_path / "a.py").write_text("x = 2\n")
    diff, source = _working_tree_diff(str(tmp_path))
    assert "x = 2" in diff and source == "uncommitted changes"


# ── Shareable report ──────────────────────────────────────────────────────────


def test_report_html_escapes_and_hides_server_paths(tmp_path: Path) -> None:
    from backend.services.report import build_report_html

    repo = tmp_path / "proj"
    repo.mkdir()
    page = build_report_html(
        repo_name="<script>x</script>",
        repo_root=repo,
        source="proj",
        total_files=3,
        total_lines=40,
        languages={"Python": 3},
        health={
            "total_score": 81,
            "grade": "B",
            "summary": "ok",
            "dimensions": [{"name": "Complexity", "score": 15, "max_score": 20, "status": "Fair"}],
            "findings": [
                {
                    "title": "Long function",
                    "severity": "high",
                    "file_path": str(repo / "pkg" / "mod.py"),
                    "line_number": 12,
                    "rule_id": "long",
                    "why_it_matters": "hard to read",
                }
            ],
        },
        analysis={"circular_dependencies": [[str(repo / "a.py"), str(repo / "b.py")]]},
    )
    assert "<script>x</script>" not in page
    assert str(tmp_path) not in page
    assert "pkg/<wbr>mod.py" in page
    assert "81" in page and "Grade B" in page
    assert "1 import loop found" in page


def test_report_endpoint_returns_download(tmp_path: Path) -> None:
    (tmp_path / "main.py").write_text("def main():\n    return 1\n")
    settings = get_settings()
    roots = list(settings.allowed_roots)
    settings.allowed_roots = [*roots, str(tmp_path)]
    try:
        with TestClient(app) as client:
            assert client.post("/api/repository/scan", json={"path": str(tmp_path)}).status_code == 200
            resp = client.get("/api/report", params={"repo_path": str(tmp_path)})
    finally:
        settings.allowed_roots = roots
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    assert "Health score" in resp.text
    assert str(tmp_path.parent) not in resp.text
