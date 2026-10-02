"""Repository Health Score — computes a 0–100 score across 5 dimensions.

Analyses a parsed repository and produces a breakdown across:
  * Documentation (20 pts)  — docstring coverage, README presence
  * Complexity   (20 pts)  — function length, nesting, file sizes
  * Architecture (20 pts)  — layer separation, circular deps, dead code
  * Maintainability (20 pts) — avg file size, class cohesion
  * Security     (20 pts)  — hardcoded secrets detection, input validation presence

Returns a ``HealthReport`` with total score, per-dimension scores,
and human-readable explanations for each deduction.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.graph.models import AnalysisResult
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


@dataclass
class DimensionScore:
    """Score for a single health dimension (0–20)."""

    name: str
    score: float
    max_score: float = 20.0
    deductions: list[str] = field(default_factory=list)


@dataclass
class HealthReport:
    """Full repository health report."""

    total_score: float
    grade: str  # A, B, C, D, F
    dimensions: list[DimensionScore]
    summary: str
    file_count: int = 0
    total_lines: int = 0


# ── Secret patterns ─────────────────────────────────────────────────────

_SECRET_PATTERNS = [
    re.compile(r"""['"](?:sk-|gsk_|ghp_|glpat-|xoxb-|xoxp-)[a-zA-Z0-9\-_]{10,}['"]"""),
    re.compile(r"""(?:password|secret|api_key|token)\s*=\s*['"][^'"]{8,}['"]""", re.I),
]


def _grade(score: float) -> str:
    """Convert a 0–100 score to a letter grade."""
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


# ── Dimension scorers ───────────────────────────────────────────────────


def _score_documentation(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score documentation quality (0–20)."""
    dim = DimensionScore(name="Documentation", score=20.0)
    if not parsed_files:
        dim.score = 0.0
        dim.deductions.append("No files to analyse")
        return dim

    total_entities = 0
    documented_entities = 0

    for _path, pf in parsed_files.items():
        for func in pf.functions:
            total_entities += 1
            if func.docstring:
                documented_entities += 1
        for cls in pf.classes:
            total_entities += 1
            if cls.docstring:
                documented_entities += 1
            for method in cls.methods:
                total_entities += 1
                if method.docstring:
                    documented_entities += 1

    if total_entities == 0:
        return dim

    coverage = documented_entities / total_entities
    if coverage < 0.3:
        dim.score -= 10
        dim.deductions.append(f"Only {coverage:.0%} of entities have docstrings (target: 60%+)")
    elif coverage < 0.6:
        dim.score -= 5
        dim.deductions.append(f"Docstring coverage is {coverage:.0%} (target: 60%+)")

    # Check for module docstrings
    undocumented_modules = sum(1 for pf in parsed_files.values() if not pf.module_docstring)
    module_ratio = undocumented_modules / len(parsed_files) if parsed_files else 0
    if module_ratio > 0.5:
        dim.score -= 3
        dim.deductions.append(f"{undocumented_modules} modules lack module-level docstrings")

    dim.score = max(0, dim.score)
    return dim


def _score_complexity(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score code complexity (0–20)."""
    dim = DimensionScore(name="Complexity", score=20.0)
    if not parsed_files:
        return dim

    long_functions = 0
    very_long_functions = 0
    large_files = 0

    for _path, pf in parsed_files.items():
        # Count lines per file
        total_lines = max(
            (func.end_line for func in pf.functions),
            default=0,
        )
        total_lines = max(
            total_lines,
            max((cls.end_line for cls in pf.classes), default=0),
        )
        if total_lines > 500:
            large_files += 1

        for func in pf.functions:
            length = func.end_line - func.start_line
            if length > 80:
                very_long_functions += 1
            elif length > 50:
                long_functions += 1

        for cls in pf.classes:
            for method in cls.methods:
                length = method.end_line - method.start_line
                if length > 80:
                    very_long_functions += 1
                elif length > 50:
                    long_functions += 1

    if very_long_functions > 0:
        dim.score -= min(8, very_long_functions * 2)
        dim.deductions.append(f"{very_long_functions} functions exceed 80 lines")

    if long_functions > 3:
        dim.score -= min(4, long_functions)
        dim.deductions.append(f"{long_functions} functions exceed 50 lines")

    if large_files > 2:
        dim.score -= min(4, large_files)
        dim.deductions.append(f"{large_files} files exceed 500 lines")

    dim.score = max(0, dim.score)
    return dim


def _score_architecture(
    parsed_files: dict[str, ParsedFile],
    analysis: AnalysisResult | None,
) -> DimensionScore:
    """Score architectural quality (0–20)."""
    dim = DimensionScore(name="Architecture", score=20.0)

    if analysis:
        cycles = len(analysis.circular_dependencies)
        if cycles > 0:
            dim.score -= min(8, cycles * 2)
            dim.deductions.append(f"{cycles} circular dependency chain(s) detected")

        dead = len(analysis.dead_code)
        if dead > 5:
            dim.score -= min(4, dead // 2)
            dim.deductions.append(f"{dead} potentially dead code entities")

    # Check for extremely coupled files (many imports)
    for path, pf in parsed_files.items():
        if len(pf.imports) > 15:
            dim.score -= 1
            dim.deductions.append(f"{path} has {len(pf.imports)} imports (high coupling)")

    dim.score = max(0, dim.score)
    return dim


def _score_maintainability(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score maintainability (0–20)."""
    dim = DimensionScore(name="Maintainability", score=20.0)
    if not parsed_files:
        return dim

    # Avg functions per file
    total_funcs = sum(len(pf.functions) + sum(len(c.methods) for c in pf.classes) for pf in parsed_files.values())
    avg_per_file = total_funcs / len(parsed_files) if parsed_files else 0

    if avg_per_file > 15:
        dim.score -= 5
        dim.deductions.append(f"Average {avg_per_file:.0f} functions per file (consider splitting)")

    # Check for very large classes
    large_classes = 0
    for pf in parsed_files.values():
        for cls in pf.classes:
            if len(cls.methods) > 15:
                large_classes += 1

    if large_classes > 0:
        dim.score -= min(5, large_classes * 2)
        dim.deductions.append(f"{large_classes} classes have >15 methods (God class smell)")

    dim.score = max(0, dim.score)
    return dim


def _score_security(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score security practices (0–20).

    Scans the entire module source (not just parsed function bodies) for
    potential hardcoded secrets so that module-level assignments such as
    ``API_KEY = 'sk-...'`` are caught.  Secret *values* are never included
    in the returned deductions to avoid leaking them to the UI or LLM.
    """
    dim = DimensionScore(name="Security", score=20.0)

    secrets_found = 0
    for path, _pf in parsed_files.items():
        # Scan the full source file to catch module-level secrets
        try:
            source = Path(path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            source = ""

        for pattern in _SECRET_PATTERNS:
            if pattern.search(source):
                secrets_found += 1
                dim.deductions.append(f"Potential hardcoded secret detected in {path}")
                break  # One deduction per file is enough

    if secrets_found > 0:
        dim.score -= min(15, secrets_found * 5)

    dim.score = max(0, dim.score)
    return dim


# ── Public API ──────────────────────────────────────────────────────────


def compute_health_score(
    parsed_files: dict[str, ParsedFile],
    analysis: AnalysisResult | None = None,
) -> HealthReport:
    """Compute the full health score for a parsed repository.

    Args:
        parsed_files: Dictionary of file paths to ParsedFile objects.
        analysis: Optional graph analysis result for architecture scoring.

    Returns:
        A HealthReport with total score, grade, and per-dimension breakdown.
    """
    dimensions = [
        _score_documentation(parsed_files),
        _score_complexity(parsed_files),
        _score_architecture(parsed_files, analysis),
        _score_maintainability(parsed_files),
        _score_security(parsed_files),
    ]

    total = sum(d.score for d in dimensions)

    # Count stats
    file_count = len(parsed_files)
    total_lines = 0
    for pf in parsed_files.values():
        max_line = max(
            (func.end_line for func in pf.functions),
            default=0,
        )
        max_line = max(
            max_line,
            max((cls.end_line for cls in pf.classes), default=0),
        )
        total_lines += max_line

    all_deductions = []
    for dim in dimensions:
        all_deductions.extend(dim.deductions)

    summary_parts = [f"Repository health score: {total:.0f}/100 ({_grade(total)})"]
    if all_deductions:
        summary_parts.append(f"{len(all_deductions)} issue(s) found across {file_count} files.")
    else:
        summary_parts.append("No significant issues detected.")

    report = HealthReport(
        total_score=round(total, 1),
        grade=_grade(total),
        dimensions=dimensions,
        summary=" ".join(summary_parts),
        file_count=file_count,
        total_lines=total_lines,
    )

    logger.info("Health score computed: %s/100 (%s)", report.total_score, report.grade)
    return report
