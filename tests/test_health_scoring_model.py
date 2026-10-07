"""Comprehensive tests for the explainable health scoring model and transparency rules."""

from __future__ import annotations

from backend.graph.models import AnalysisResult
from backend.parser.models import ClassInfo, FunctionInfo, ImportInfo, ParsedFile
from backend.services.health_score import (
    compute_health_score,
)
from backend.services.tech_debt import analyse_tech_debt


def _make_function(
    name: str = "my_func",
    start: int = 1,
    end: int = 10,
    docstring: str = "",
    source: str = "",
) -> FunctionInfo:
    return FunctionInfo(
        name=name,
        args=[],
        return_type=None,
        decorators=[],
        start_line=start,
        end_line=end,
        docstring=docstring,
        source_code=source,
        calls=[],
    )


def _make_class(
    name: str = "MyClass",
    methods: list[FunctionInfo] | None = None,
    docstring: str = "",
    start: int = 1,
    end: int = 50,
) -> ClassInfo:
    return ClassInfo(
        name=name,
        bases=[],
        decorators=[],
        methods=methods or [],
        attributes=[],
        start_line=start,
        end_line=end,
        docstring=docstring,
    )


def _make_parsed_file(
    path: str = "test.py",
    functions: list[FunctionInfo] | None = None,
    classes: list[ClassInfo] | None = None,
    imports: list[ImportInfo] | None = None,
    module_docstring: str = "",
) -> ParsedFile:
    return ParsedFile(
        file_path=path,
        language="Python",
        functions=functions or [],
        classes=classes or [],
        imports=imports or [],
        module_docstring=module_docstring,
    )


class TestHealthScoringPillars:
    """Tests evaluating each of the 5 explainable scoring dimensions."""

    def test_empty_repository_gives_perfect_scores(self) -> None:
        report = compute_health_score({})
        assert report.total_score == 100.0
        assert report.grade == "A"
        assert len(report.dimensions) == 5
        for dim in report.dimensions:
            assert dim.score == 20.0
            assert dim.max_score == 20.0
            assert dim.status == "Healthy"
            assert dim.total_penalties == 0.0

    def test_documentation_scoring_thresholds(self) -> None:
        # 10 public functions, only 1 documented = 10% coverage (< 30% critical threshold)
        funcs = [_make_function(f"f_{i}", docstring="docs" if i == 0 else "") for i in range(10)]
        pf = _make_parsed_file("doc_test.py", functions=funcs)
        report = compute_health_score({"doc_test.py": pf})

        doc_dim = next(d for d in report.dimensions if d.key == "documentation")
        assert doc_dim.score < 20.0
        assert any(p.rule_id == "critical_docstring_coverage" for p in doc_dim.penalties)
        # Check formula is present and explicit
        assert "20.0 -" in doc_dim.formula
        # Check metrics are populated
        cov_metric = next(m for m in doc_dim.metrics if m.key == "symbol_docstring_coverage")
        assert cov_metric.measured_value == 10.0
        assert cov_metric.status == "at_risk"

    def test_complexity_threshold_boundaries(self) -> None:
        # Test long function (55 lines) vs very long function (85 lines)
        long_fn = _make_function("long_fn", start=1, end=56)  # 55 lines
        very_long_fn = _make_function("huge_fn", start=1, end=86)  # 85 lines
        pf = _make_parsed_file("complex.py", functions=[long_fn, very_long_fn])

        report = compute_health_score({"complex.py": pf})
        comp_dim = next(d for d in report.dimensions if d.key == "complexity")
        assert len(comp_dim.penalties) >= 1
        assert any(p.rule_id == "very_long_functions" for p in comp_dim.penalties)
        assert len(comp_dim.top_contributors) > 0
        assert comp_dim.top_contributors[0].file_path == "complex.py"

    def test_complexity_deep_nesting_detection(self) -> None:
        deep_code = (
            "def deeply_nested():\n"
            "    if True:\n"
            "        if True:\n"
            "            if True:\n"
            "                if True:\n"
            "                    if True:\n"
            "                        if True:\n"
            "                            return 42\n"
        )
        nested_fn = _make_function("deeply_nested", start=1, end=8)
        nested_fn.source_code = deep_code
        pf = _make_parsed_file("nested.py", functions=[nested_fn])

        report = compute_health_score({"nested.py": pf})
        comp_dim = next(d for d in report.dimensions if d.key == "complexity")
        assert any(p.rule_id == "deep_nesting" for p in comp_dim.penalties)
        metric = next(m for m in comp_dim.metrics if m.key == "deep_nesting")
        assert metric.measured_value == 1

    def test_architecture_circular_dependencies_penalties(self) -> None:
        cycle = ["a.py", "b.py", "a.py"]
        mock_analysis = AnalysisResult(
            circular_dependencies=[cycle],
        )
        report = compute_health_score({}, analysis=mock_analysis)
        arch_dim = next(d for d in report.dimensions if d.key == "architecture")
        assert arch_dim.score <= 18.0
        assert any(p.rule_id == "circular_dependencies" for p in arch_dim.penalties)
        assert "Circular" in arch_dim.penalties[0].rule_name

    def test_maintainability_god_class_detection(self) -> None:
        # Class with 20 methods (> threshold 15)
        methods = [_make_function(f"m_{i}") for i in range(20)]
        god_class = _make_class("GodService", methods=methods)
        pf = _make_parsed_file("god.py", classes=[god_class])

        report = compute_health_score({"god.py": pf})
        maint_dim = next(d for d in report.dimensions if d.key == "maintainability")
        assert any(p.rule_id == "god_classes" for p in maint_dim.penalties)
        assert maint_dim.score < 20.0

    def test_security_hardcoded_secrets_detection(self) -> None:
        secret_func = _make_function("connect", source="api_key = 'sk-1234567890abcdef12345678'")
        pf = _make_parsed_file("secret.py", functions=[secret_func])

        report = compute_health_score({"secret.py": pf})
        sec_dim = next(d for d in report.dimensions if d.key == "security")
        assert any(p.rule_id == "hardcoded_secrets" for p in sec_dim.penalties)
        assert sec_dim.score <= 15.0  # Heavy penalty for hardcoded credentials


class TestIssueCountReconciliation:
    """Tests resolving summary vs detail issue count discrepancies (PRD Section 11)."""

    def test_issue_count_breakdown_clarity(self) -> None:
        # Create multi-issue files
        f1 = _make_function("huge", start=1, end=100, source="api_key = 'sk-1234567890abcdef12345678'")
        pf = _make_parsed_file("sample.py", functions=[f1])
        health_rep = compute_health_score({"sample.py": pf})

        counts = health_rep.issue_counts
        assert counts is not None
        assert counts.scoring_rules_triggered > 0
        assert "scoring deduction rules" in counts.explanation.lower()

    def test_symbol_grouping_in_tech_debt(self) -> None:
        # Function with multiple issues: very long + missing docstring
        f1 = _make_function("mega_worker", start=1, end=90, docstring="")
        pf = _make_parsed_file("worker.py", functions=[f1])

        debt_rep = analyse_tech_debt({"worker.py": pf})
        assert len(debt_rep.all_smells) >= 1
        assert len(debt_rep.grouped_by_symbol) >= 1
        group = debt_rep.grouped_by_symbol[0]
        assert group["entity_name"] == "mega_worker"
        assert group["file_path"] == "worker.py"
        assert len(group["smells"]) >= 1
        for smell in group["smells"]:
            assert smell.threshold != ""
            assert smell.observed != ""
            assert smell.confidence in ("high", "medium", "low")
            assert smell.why_it_matters != ""
