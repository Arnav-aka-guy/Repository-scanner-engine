"""Comprehensive unit & integration tests for Release V2.1 features:
- Change Impact Analysis
- Automated AI Code Review
- Historical Repository Health Analytics
- Background Scan Worker & Job Concurrency
- Standard Health & Readiness Endpoints
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import MagicMock

import networkx as nx
import pytest
from fastapi.testclient import TestClient

from backend.core.health import check_liveness, check_readiness
from backend.main import app
from backend.parser.models import FunctionInfo, ImportInfo, ParsedFile
from backend.services.change_impact import ChangeImpactService
from backend.services.code_review import CodeReviewService
from backend.services.health_history import HealthHistoryService
from backend.services.scan_worker import ScanJobManager

# ── 1. Change Impact Analysis Tests ──────────────────────────────────────────


def test_change_impact_analysis_direct_indirect_and_tests() -> None:
    service = ChangeImpactService()

    # Build a dependency graph:
    # api/users.py -> services/user_service.py -> db/user_repo.py
    # tests/test_user.py -> services/user_service.py
    g = nx.DiGraph()
    g.add_edge("api/users.py", "services/user_service.py")
    g.add_edge("services/user_service.py", "db/user_repo.py")
    g.add_edge("tests/test_user.py", "services/user_service.py")

    pf_repo = ParsedFile(
        file_path="db/user_repo.py",
        functions=[FunctionInfo(name="query_user", args=["id"], start_line=1, end_line=10)],
    )
    pf_svc = ParsedFile(
        file_path="services/user_service.py",
        imports=[ImportInfo(module="db.user_repo", names=["query_user"])],
        functions=[FunctionInfo(name="get_user", args=["id"], calls=["query_user"], start_line=1, end_line=15)],
    )
    pf_api = ParsedFile(
        file_path="api/users.py",
        imports=[ImportInfo(module="services.user_service", names=["get_user"])],
    )
    pf_test = ParsedFile(
        file_path="tests/test_user.py",
        imports=[ImportInfo(module="services.user_service", names=["get_user"])],
    )

    parsed_files = {
        "db/user_repo.py": pf_repo,
        "services/user_service.py": pf_svc,
        "api/users.py": pf_api,
        "tests/test_user.py": pf_test,
    }

    report = service.analyze_impact(
        graph=g,
        parsed_files=parsed_files,
        target_files=["db/user_repo.py"],
        target_symbols=["query_user"],
    )

    assert report.risk_score > 0
    assert report.risk_level in ("Low", "Medium", "High", "Critical")

    # Direct dependents of user_repo: user_service
    direct_files = [m.file_path for m in report.directly_affected_modules]
    assert "services/user_service.py" in direct_files

    # Indirect dependents: api/users.py and tests/test_user.py
    indirect_files = [m.file_path for m in report.indirectly_affected_modules]
    assert any("api/users.py" in f for f in indirect_files)

    # API consumers detected
    assert any("api/users.py" in c for c in report.api_consumers)

    # Recommended tests detected
    assert any("tests/test_user.py" in t for t in report.recommended_tests)

    # Markdown export
    md_rep = service.generate_markdown_report(report)
    assert "# Change Impact Analysis Report" in md_rep
    assert "Overall Risk:" in md_rep


# ── 2. Automated AI Code Review Tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_code_review_deterministic_diff_analysis() -> None:
    service = CodeReviewService()

    sample_diff = textwrap.dedent("""\
        diff --git a/services/auth.py b/services/auth.py
        --- a/services/auth.py
        +++ b/services/auth.py
        @@ -10,3 +10,8 @@
         def verify_token(token):
        +    time.sleep(2)
        +    query = f"SELECT * FROM users WHERE id = '{token}'"
        +    db.execute(query)
        +    except:
        +        print("error")
             return True
    """)

    report = await service.run_review(sample_diff, use_llm=False)

    assert report.deterministic_mode is True
    assert len(report.files_reviewed) == 1
    assert "services/auth.py" in report.files_reviewed

    # Check detected static vulnerabilities & anti-patterns
    categories = {f.category for f in report.findings}
    titles = [f.title for f in report.findings]

    assert "security" in categories
    assert any("SQL Injection" in t for t in titles)
    assert any("Sleep in Asynchronous" in t or "Bare Except" in t for t in titles)

    # Missing tests warning if diff modifies source without tests
    assert any(f.category == "missing_test" for f in report.findings)


# ── 3. Historical Health Analytics Tests ──────────────────────────────────────


def test_health_history_snapshot_and_comparison(tmp_path: Path) -> None:
    service = HealthHistoryService()

    # Create dummy repo path
    repo_dir = tmp_path / "sample_repo"
    repo_dir.mkdir()

    # Snapshot 1: baseline
    snap1_data = {
        "total_score": 75.0,
        "grade": "C",
        "file_count": 10,
        "total_lines": 500,
        "dimensions": [{"key": "maintainability", "score": 70.0}],
        "findings": [
            {"file_path": "a.py", "rule_id": "cognitive_complexity", "line": 10, "severity": "medium"},
            {"file_path": "b.py", "rule_id": "bare_except", "line": 20, "severity": "low"},
        ],
    }
    snap1 = service.record_snapshot(str(repo_dir), snap1_data, tech_debt_minutes=45.0)

    # Snapshot 2: improved
    snap2_data = {
        "total_score": 88.0,
        "grade": "B",
        "file_count": 10,
        "total_lines": 505,
        "dimensions": [{"key": "maintainability", "score": 85.0}],
        "findings": [
            {"file_path": "a.py", "rule_id": "cognitive_complexity", "line": 10, "severity": "medium"},
        ],
    }
    snap2 = service.record_snapshot(str(repo_dir), snap2_data, tech_debt_minutes=20.0)
    assert snap1.snapshot_id != snap2.snapshot_id

    history = service.get_history(str(repo_dir))
    assert len(history) == 2
    assert history[0].total_score == 75.0
    assert history[1].total_score == 88.0

    comparison = service.compare_scans(str(repo_dir), baseline_id=snap1.snapshot_id, current_id=snap2.snapshot_id)
    assert comparison is not None
    assert comparison.score_delta == 13.0
    assert "C -> B" in comparison.grade_change
    assert comparison.tech_debt_delta_minutes == -25.0
    # Resolved bare_except in b.py
    assert len(comparison.resolved_findings) == 1
    assert "b.py:bare_except:20" in comparison.resolved_findings[0]


# ── 4. Scan Worker & Job Concurrency Tests ────────────────────────────────────


@pytest.mark.asyncio
async def test_scan_job_manager_concurrency_and_cancellation(tmp_path: Path) -> None:
    manager = ScanJobManager()
    repo_path = str(tmp_path / "test_repo")
    Path(repo_path).mkdir()

    mock_parser = MagicMock()
    mock_parser.scan_repository = MagicMock()
    mock_embeddings = MagicMock()

    # Create job 1
    job1 = await manager.create_scan_job(repo_path, mock_parser, mock_embeddings)
    assert job1["status"] in ("pending", "scanning")

    # Second concurrent call for same repo returns the in-flight job, avoiding duplicate scan
    job2 = await manager.create_scan_job(repo_path, mock_parser, mock_embeddings)
    assert job2["job_id"] == job1["job_id"]

    # Cancel job
    cancelled = await manager.cancel_job(job1["job_id"])
    assert cancelled["status"] == "cancelled"


# ── 5. Standard Health & Readiness Endpoints Tests ────────────────────────────


@pytest.mark.asyncio
async def test_liveness_and_readiness_probes() -> None:
    live = await check_liveness()
    assert live["status"] == "alive"

    is_ready, details = await check_readiness()
    assert is_ready is True
    assert details["status"] == "ready"
    assert "storage" in details["components"]
    assert "embeddings" in details["components"]
    assert "llm" in details["components"]


def test_api_health_endpoints() -> None:
    client = TestClient(app)

    # GET /health
    r_health = client.get("/health")
    assert r_health.status_code == 200
    data = r_health.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert data["version"] == "2.1.0"

    # GET /health/live and /livez
    r_live = client.get("/health/live")
    assert r_live.status_code == 200
    assert r_live.json()["status"] == "alive"

    r_livez = client.get("/livez")
    assert r_livez.status_code == 200

    # GET /health/ready and /readyz
    r_ready = client.get("/health/ready")
    assert r_ready.status_code == 200
    assert r_ready.json()["status"] == "ready"
