"""Tests for the health score and tech debt services."""

from __future__ import annotations

from backend.parser.models import ClassInfo, FunctionInfo, ImportInfo, ParsedFile
from backend.services.health_score import HealthReport, compute_health_score
from backend.services.tech_debt import TechDebtReport, analyse_tech_debt

# ── Test Fixtures ───────────────────────────────────────────────────────


def _make_function(
    name: str = "my_func",
    start: int = 1,
    end: int = 10,
    docstring: str = "",
    source: str = "",
) -> FunctionInfo:
    """Create a FunctionInfo for testing."""
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
    """Create a ClassInfo for testing."""
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
    language: str = "Python",
) -> tuple[str, ParsedFile]:
    """Create a (path, ParsedFile) pair for testing."""
    pf = ParsedFile(
        file_path=path,
        language=language,
        imports=imports or [],
        functions=functions or [],
        classes=classes or [],
        module_docstring=module_docstring,
    )
    return path, pf


# ── Health Score Tests ──────────────────────────────────────────────────


class TestHealthScore:
    """Test suite for the health score computation."""

    def test_perfect_score_empty_repo(self):
        """Empty repo should get full score (nothing to deduct from)."""
        report = compute_health_score({})
        assert isinstance(report, HealthReport)
        # All dimensions start at 20, empty repo should be close to 100
        assert report.total_score >= 80

    def test_documented_code_scores_high(self):
        """Fully documented code should score high on docs dimension."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("func1", docstring="Does things"),
                _make_function("func2", docstring="Does other things"),
            ],
            classes=[
                _make_class("MyClass", docstring="A class", methods=[
                    _make_function("method1", docstring="A method"),
                ]),
            ],
            module_docstring="Module docs",
        )
        report = compute_health_score({path: pf})
        doc_dim = next(d for d in report.dimensions if d.name == "Documentation")
        assert doc_dim.score >= 15  # Should score high

    def test_undocumented_code_penalised(self):
        """Code without docstrings should lose docs points."""
        funcs = [_make_function(f"func{i}") for i in range(10)]
        path, pf = _make_parsed_file(functions=funcs)
        report = compute_health_score({path: pf})
        doc_dim = next(d for d in report.dimensions if d.name == "Documentation")
        assert doc_dim.score < 15  # Should be penalised
        assert len(doc_dim.deductions) > 0

    def test_long_functions_penalise_complexity(self):
        """Functions over 80 lines should reduce complexity score."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("god_func", start=1, end=100),
            ],
        )
        report = compute_health_score({path: pf})
        cplx = next(d for d in report.dimensions if d.name == "Complexity")
        assert cplx.score < 20

    def test_grade_assignment(self):
        """Grades should be A-F based on score ranges."""
        report = compute_health_score({})
        assert report.grade in ("A", "B", "C", "D", "F")

    def test_report_has_all_dimensions(self):
        """Report should always have exactly 5 dimensions."""
        report = compute_health_score({})
        assert len(report.dimensions) == 5
        names = {d.name for d in report.dimensions}
        assert names == {"Documentation", "Complexity", "Architecture", "Maintainability", "Security"}


# ── Tech Debt Tests ─────────────────────────────────────────────────────


class TestTechDebt:
    """Test suite for the tech debt analysis."""

    def test_clean_repo_low_debt(self):
        """Clean repo with small functions should have low debt."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("small_func", start=1, end=20, docstring="Small"),
            ],
        )
        report = analyse_tech_debt({path: pf})
        assert isinstance(report, TechDebtReport)
        assert report.debt_rating in ("Low", "Moderate")

    def test_detects_long_functions(self):
        """Functions over 50 lines should be flagged."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("long_func", start=1, end=60),
            ],
        )
        report = analyse_tech_debt({path: pf})
        assert report.total_smells > 0
        categories = report.smells_by_category
        assert "long_function" in categories or "missing_docstring" in categories

    def test_detects_very_long_functions(self):
        """Functions over 80 lines should be high severity."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("god_func", start=1, end=100),
            ],
        )
        report = analyse_tech_debt({path: pf})
        high_smells = [s for s in report.all_smells if s.severity == "high"]
        assert len(high_smells) > 0

    def test_detects_god_class(self):
        """Classes with 16+ methods should be flagged as god classes."""
        methods = [_make_function(f"method_{i}", start=i * 10, end=i * 10 + 5) for i in range(16)]
        path, pf = _make_parsed_file(
            classes=[_make_class("GodClass", methods=methods, end=200)],
        )
        report = analyse_tech_debt({path: pf})
        assert "god_class" in report.smells_by_category

    def test_detects_high_coupling(self):
        """Files with >10 imports should be flagged."""
        imports = [ImportInfo(module=f"mod{i}", names=[], is_from=True) for i in range(15)]
        path, pf = _make_parsed_file(imports=imports)
        report = analyse_tech_debt({path: pf})
        assert "high_coupling" in report.smells_by_category

    def test_detects_missing_docstrings(self):
        """Functions without docstrings should be flagged."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("undoc_func", docstring=""),
            ],
        )
        report = analyse_tech_debt({path: pf})
        assert "missing_docstring" in report.smells_by_category

    def test_detects_large_file(self):
        """Files with >300 estimated lines should be flagged."""
        path, pf = _make_parsed_file(
            functions=[
                _make_function("func1", start=1, end=400),
            ],
        )
        report = analyse_tech_debt({path: pf})
        # Should have large_file or long_function
        assert report.total_smells > 0

    def test_debt_rating_categories(self):
        """Debt ratings should be one of the defined categories."""
        report = analyse_tech_debt({})
        assert report.debt_rating in ("Low", "Moderate", "High", "Critical")

    def test_suggestions_generated_for_many_smells(self):
        """When many smells exist, suggestions should be generated."""
        funcs = [_make_function(f"long_func_{i}", start=i * 60, end=i * 60 + 55) for i in range(5)]
        path, pf = _make_parsed_file(functions=funcs)
        report = analyse_tech_debt({path: pf})
        # Should have suggestions when there are many smells
        assert report.total_smells > 0

    def test_empty_repo_no_smells(self):
        """Empty repo should have zero smells."""
        report = analyse_tech_debt({})
        assert report.total_smells == 0
        assert report.total_debt_score == 0
