"""Tests for repository comparison and dependency risk services."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.parser.models import ClassInfo, FunctionInfo, ImportInfo, ParsedFile


# ── Helpers ─────────────────────────────────────────────────────────────


def _func(name: str = "f", start: int = 1, end: int = 10, docstring: str = "", source: str = "") -> FunctionInfo:
    return FunctionInfo(
        name=name, args=[], return_type=None, decorators=[],
        start_line=start, end_line=end, docstring=docstring,
        source_code=source, calls=[],
    )


def _pf(
    path: str = "test.py",
    funcs: list[FunctionInfo] | None = None,
    classes: list[ClassInfo] | None = None,
    imports: list[ImportInfo] | None = None,
    lang: str = "Python",
) -> tuple[str, ParsedFile]:
    pf = ParsedFile(
        file_path=path,
        language=lang,
        imports=imports or [],
        functions=funcs or [],
        classes=classes or [],
        module_docstring="",
    )
    return path, pf


# ── Repo Comparison Tests ──────────────────────────────────────────────


class TestRepoComparison:
    """Test suite for repository comparison service."""

    def test_compare_identical_repos(self):
        """Comparing a repo with itself should yield similar scores."""
        from backend.services.repo_comparison import compare_repositories

        files = dict([_pf("a.py", [_func("f1", docstring="doc")])])
        result = compare_repositories(files, files, "A", "B")

        assert result.repo_a.health_score == result.repo_b.health_score
        assert result.repo_a.health_grade == result.repo_b.health_grade

    def test_compare_different_sizes(self):
        """Larger repo should have more files reported."""
        from backend.services.repo_comparison import compare_repositories

        small = dict([_pf("a.py", [_func()])])
        large = dict([_pf(f"f{i}.py", [_func(f"func{i}")]) for i in range(10)])

        result = compare_repositories(small, large, "Small", "Large")
        assert result.repo_a.file_count == 1
        assert result.repo_b.file_count == 10
        assert any("larger" in i.lower() for i in result.insights)

    def test_compare_health_difference(self):
        """Repo with documented code should score better."""
        from backend.services.repo_comparison import compare_repositories

        documented = dict([
            _pf("d.py", [
                _func(f"f{i}", docstring=f"Does thing {i}") for i in range(5)
            ])
        ])
        undocumented = dict([
            _pf("u.py", [_func(f"f{i}") for i in range(10)])
        ])

        result = compare_repositories(documented, undocumented, "Good", "Bad")
        assert result.repo_a.health_grade != "?"
        assert result.repo_b.health_grade != "?"

    def test_winner_is_higher_health(self):
        """Winner should be the repo with higher health score."""
        from backend.services.repo_comparison import compare_repositories

        good = dict([_pf("g.py", [_func("f", docstring="doc")])])
        bad = dict([
            _pf("b.py", [_func(f"long_func_{i}", start=i * 100, end=i * 100 + 90) for i in range(5)])
        ])

        result = compare_repositories(good, bad, "Good", "Bad", "/good", "/bad")
        assert result.winner == "/good" or result.winner == "/bad"

    def test_insights_generated(self):
        """Comparison should always generate at least one insight."""
        from backend.services.repo_comparison import compare_repositories

        a = dict([_pf("a.py", [_func()])])
        b = dict([_pf("b.py", [_func()])])

        result = compare_repositories(a, b)
        assert len(result.insights) >= 1


# ── Dependency Risk Tests ──────────────────────────────────────────────


class TestDependencyRisk:
    """Test suite for dependency risk analysis."""

    def test_analyse_with_requirements(self, tmp_path: Path):
        """Should parse requirements.txt correctly."""
        from backend.services.dependency_risk import analyse_dependency_risk

        req = tmp_path / "requirements.txt"
        req.write_text("fastapi>=0.100.0\nuvicorn\npydantic==2.0.0\n")

        report = analyse_dependency_risk(str(tmp_path))
        assert report.python_deps == 3
        assert report.total_dependencies >= 3

    def test_analyse_with_package_json(self, tmp_path: Path):
        """Should parse package.json correctly."""
        from backend.services.dependency_risk import analyse_dependency_risk

        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "dependencies": {
                "react": "^19.0.0",
                "react-dom": "^19.0.0",
            },
            "devDependencies": {
                "vite": "^6.0.0",
            },
        }))

        report = analyse_dependency_risk(str(tmp_path))
        assert report.node_deps == 3

    def test_detect_unpinned_deps(self, tmp_path: Path):
        """Unpinned deps should be flagged as medium risk."""
        from backend.services.dependency_risk import analyse_dependency_risk

        req = tmp_path / "requirements.txt"
        req.write_text("numpy\nscipy\n")

        report = analyse_dependency_risk(str(tmp_path))
        medium_count = report.risk_summary.get("medium", 0)
        assert medium_count >= 2

    def test_detect_wildcard_npm(self, tmp_path: Path):
        """Wildcard npm versions should be flagged as high risk."""
        from backend.services.dependency_risk import analyse_dependency_risk

        pkg = tmp_path / "package.json"
        pkg.write_text(json.dumps({
            "dependencies": {"bad-pkg": "*"},
        }))

        report = analyse_dependency_risk(str(tmp_path))
        assert report.risk_summary.get("high", 0) >= 1

    def test_empty_repo_no_deps(self, tmp_path: Path):
        """Repo with no dependency files should have 0 deps."""
        from backend.services.dependency_risk import analyse_dependency_risk

        report = analyse_dependency_risk(str(tmp_path))
        assert report.total_dependencies == 0
        assert report.pinning_score == 100.0

    def test_pinning_score_range(self, tmp_path: Path):
        """Pinning score should be between 0 and 100."""
        from backend.services.dependency_risk import analyse_dependency_risk

        req = tmp_path / "requirements.txt"
        req.write_text("fastapi==0.100.0\nuvicorn>=0.20.0\npkg_without_pin\n")

        report = analyse_dependency_risk(str(tmp_path))
        assert 0 <= report.pinning_score <= 100
