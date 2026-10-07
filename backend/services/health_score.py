"""Repository Health Score — transparent and explainable 0–100 code quality scoring.

Computes a transparent, traceable health report across 5 weighted dimensions:
  * Documentation   (20 pts, 20% weight) — entity and module docstring coverage
  * Complexity      (20 pts, 20% weight) — long functions, oversized files, nesting
  * Architecture    (20 pts, 20% weight) — layer separation, circular dependencies, dead code
  * Maintainability (20 pts, 20% weight) — function density, god classes, cognitive load
  * Security        (20 pts, 20% weight) — hardcoded secrets, input sanitization

Every score exposes:
  - What was measured (metrics & units)
  - What threshold was used
  - Exact mathematical penalty deductions
  - Which files contributed to the score
  - Distinction between raw signals vs prioritized findings
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.graph.models import AnalysisResult
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


# ── 1. Centralized Scoring Configuration & Weights ────────────────────────

HEALTH_DIMENSION_MAX: float = 20.0

HEALTH_WEIGHTS: dict[str, float] = {
    "Documentation": 0.20,
    "Complexity": 0.20,
    "Architecture": 0.20,
    "Maintainability": 0.20,
    "Security": 0.20,
}

THRESHOLDS: dict[str, dict[str, Any]] = {
    "documentation": {
        "target_coverage_ratio": 0.60,  # ≥ 60% coverage recommended
        "critical_coverage_ratio": 0.30,  # < 30% is critical
        "max_undocumented_modules_ratio": 0.50,  # > 50% undocumented modules triggers penalty
    },
    "complexity": {
        "long_function_lines": 50,  # > 50 lines review
        "very_long_function_lines": 80,  # > 80 lines critical
        "large_file_lines": 500,  # > 500 lines large file
        "max_nesting_depth": 5,  # > 5 indentation levels review
        "tolerance_long_functions": 3,
        "tolerance_large_files": 2,
    },
    "architecture": {
        "max_circular_dependencies": 0,
        "tolerance_dead_code": 5,
        "high_coupling_imports": 15,
    },
    "maintainability": {
        "max_avg_functions_per_file": 15.0,
        "god_class_methods": 15,
    },
    "security": {
        "max_secrets": 0,
    },
}

_SECRET_PATTERNS = [
    re.compile(r"""['"](?:sk-|gsk_|ghp_|glpat-|xoxb-|xoxp-)[a-zA-Z0-9\-_]{10,}['"]"""),
    re.compile(r"""(?:password|secret|api_key|token)\s*=\s*['"][^'"]{8,}['"]""", re.I),
]


# ── 2. Formal Data Models ─────────────────────────────────────────────────


@dataclass
class MeasuredMetric:
    """A measured parameter with observed value, unit, threshold, and status."""

    name: str
    key: str
    measured_value: Any
    display_value: str
    unit: str
    threshold: Any
    threshold_display: str
    status: str  # "good" | "review" | "at_risk"
    description: str


@dataclass
class ScorePenalty:
    """An exact mathematical deduction applied to a dimension based on rule evaluation."""

    rule_id: str
    rule_name: str
    points_deducted: float
    reason: str
    threshold: str
    observed: str
    severity: str  # "critical" | "high" | "medium" | "low"
    confidence: str  # "high" | "medium" | "low"
    affected_files: list[str] = field(default_factory=list)


@dataclass
class FileScoreContribution:
    """A top file contributing to deductions within a dimension."""

    file_path: str
    deduction_points: float
    finding_count: int
    summary: str


@dataclass
class DimensionScore:
    """Score for a single health dimension with complete transparency."""

    name: str
    score: float
    max_score: float = 20.0
    weight: float = 0.20
    key: str = ""
    status: str = "Healthy"  # "Healthy" | "Needs Review" | "At Risk"
    starting_score: float = 20.0
    total_penalties: float = 0.0
    formula: str = ""
    metrics: list[MeasuredMetric] = field(default_factory=list)
    penalties: list[ScorePenalty] = field(default_factory=list)
    top_contributors: list[FileScoreContribution] = field(default_factory=list)
    deductions: list[str] = field(default_factory=list)  # backward compatibility


@dataclass
class IssueCountsSummary:
    """Clear breakdown of raw signals vs scoring rules vs actionable issues."""

    raw_signals: int
    scoring_rules_triggered: int
    prioritized_actionable: int
    files_affected: int
    explanation: str


@dataclass
class AnalysisStatistics:
    """Raw codebase telemetry measured by the static analysis pipeline."""

    files_analyzed: int
    total_lines: int
    total_functions: int
    total_classes: int
    public_functions: int
    documented_functions: int
    undocumented_functions: int
    average_function_length: float
    max_function_length: int
    longest_function: str
    circular_dependencies: int
    architecture_violations: int
    potential_secrets: int
    total_code_smells: int
    god_classes_count: int
    oversized_files_count: int


@dataclass
class HealthReport:
    """Complete transparent health report."""

    total_score: float
    grade: str  # A, B, C, D, F
    dimensions: list[DimensionScore]
    summary: str
    file_count: int = 0
    total_lines: int = 0
    weights: dict[str, float] = field(default_factory=dict)
    scoring_formula: str = ""
    issue_counts: IssueCountsSummary | None = None
    statistics: AnalysisStatistics | None = None


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


def _status_for_score(score: float, max_score: float = 20.0) -> str:
    pct = (score / max_score) * 100 if max_score > 0 else 0
    if pct >= 80:
        return "Healthy"
    if pct >= 60:
        return "Needs Review"
    return "At Risk"


# ── 3. Dimension Scorers ──────────────────────────────────────────────────


def _score_documentation(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score documentation quality (0–20)."""
    dim = DimensionScore(
        name="Documentation",
        key="documentation",
        score=20.0,
        max_score=HEALTH_DIMENSION_MAX,
        weight=HEALTH_WEIGHTS["Documentation"],
        starting_score=20.0,
    )

    if not parsed_files:
        dim.score = 20.0
        dim.status = "Healthy"
        dim.formula = "20.0 (empty repository) = 20.0 / 20"
        dim.metrics.append(
            MeasuredMetric(
                name="Entity Count",
                key="entity_count",
                measured_value=0,
                display_value="0 entities",
                unit="entities",
                threshold=0,
                threshold_display="N/A",
                status="good",
                description="Total symbols and functions analyzed.",
            )
        )
        return dim

    total_entities = 0
    documented_entities = 0
    undocumented_by_file: dict[str, int] = {}

    for path, pf in parsed_files.items():
        file_undoc = 0
        for func in pf.functions:
            total_entities += 1
            if func.docstring:
                documented_entities += 1
            else:
                file_undoc += 1
        for cls in pf.classes:
            total_entities += 1
            if cls.docstring:
                documented_entities += 1
            else:
                file_undoc += 1
            for method in cls.methods:
                total_entities += 1
                if method.docstring:
                    documented_entities += 1
                else:
                    file_undoc += 1
        if file_undoc > 0:
            undocumented_by_file[path] = file_undoc

    coverage = (documented_entities / total_entities) if total_entities > 0 else 1.0
    undocumented_modules = sum(1 for pf in parsed_files.values() if not pf.module_docstring)
    module_ratio = (undocumented_modules / len(parsed_files)) if parsed_files else 0.0

    # Record Measured Metrics
    cov_status = "good" if coverage >= 0.6 else "review" if coverage >= 0.3 else "at_risk"
    dim.metrics.append(
        MeasuredMetric(
            name="Symbol Docstring Coverage",
            key="symbol_docstring_coverage",
            measured_value=round(coverage * 100, 1),
            display_value=f"{coverage:.0%}",
            unit="%",
            threshold=60.0,
            threshold_display="≥ 60%",
            status=cov_status,
            description="Percentage of functions, classes, and methods with docstrings.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Documented Entities",
            key="documented_entities",
            measured_value=documented_entities,
            display_value=f"{documented_entities} / {total_entities}",
            unit="entities",
            threshold=total_entities,
            threshold_display="All public symbols",
            status="good" if coverage >= 0.6 else "review",
            description="Number of documented functions, methods, and classes.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Module Header Documentation",
            key="module_docstrings",
            measured_value=len(parsed_files) - undocumented_modules,
            display_value=f"{len(parsed_files) - undocumented_modules} / {len(parsed_files)} modules",
            unit="modules",
            threshold="≥ 50%",
            threshold_display="≥ 50% modules documented",
            status="good" if module_ratio <= 0.5 else "review",
            description="Modules containing top-level docstrings.",
        )
    )

    # Penalties
    penalties: list[ScorePenalty] = []
    top_affected_files = sorted(undocumented_by_file.keys(), key=lambda p: undocumented_by_file[p], reverse=True)[:5]

    if total_entities > 0:
        if coverage < 0.3:
            p = ScorePenalty(
                rule_id="critical_docstring_coverage",
                rule_name="Critical Docstring Coverage",
                points_deducted=10.0,
                reason=f"Only {coverage:.0%} of entities have docstrings (threshold: ≥ 60%)",
                threshold="≥ 60%",
                observed=f"{coverage:.0%}",
                severity="critical",
                confidence="high",
                affected_files=top_affected_files,
            )
            penalties.append(p)
            dim.deductions.append(p.reason)
        elif coverage < 0.6:
            p = ScorePenalty(
                rule_id="low_docstring_coverage",
                rule_name="Low Docstring Coverage",
                points_deducted=5.0,
                reason=f"Docstring coverage is {coverage:.0%} (threshold: ≥ 60%)",
                threshold="≥ 60%",
                observed=f"{coverage:.0%}",
                severity="medium",
                confidence="high",
                affected_files=top_affected_files,
            )
            penalties.append(p)
            dim.deductions.append(p.reason)

    if module_ratio > 0.5:
        undoc_mods = [p for p, pf in parsed_files.items() if not pf.module_docstring][:5]
        p = ScorePenalty(
            rule_id="missing_module_docstrings",
            rule_name="Missing Module Docstrings",
            points_deducted=3.0,
            reason=f"{undocumented_modules} modules lack module-level docstrings ({module_ratio:.0%} > 50% threshold)",
            threshold="≤ 50% undocumented",
            observed=f"{module_ratio:.0%} undocumented",
            severity="low",
            confidence="high",
            affected_files=undoc_mods,
        )
        penalties.append(p)
        dim.deductions.append(p.reason)

    total_deductions = sum(p.points_deducted for p in penalties)
    dim.total_penalties = total_deductions
    dim.score = max(0.0, round(dim.starting_score - total_deductions, 1))
    dim.status = _status_for_score(dim.score, dim.max_score)
    dim.penalties = penalties

    # Top contributors
    for file_path in top_affected_files[:5]:
        cnt = undocumented_by_file[file_path]
        dim.top_contributors.append(
            FileScoreContribution(
                file_path=file_path,
                deduction_points=round((cnt / max(1, total_entities - documented_entities)) * total_deductions, 1)
                if total_deductions > 0
                else 0.0,
                finding_count=cnt,
                summary=f"{cnt} undocumented function(s) or class(es)",
            )
        )

    deduction_str = " - ".join(f"{p.points_deducted:.1f} ({p.rule_name})" for p in penalties)
    dim.formula = (
        f"20.0 - {deduction_str} = {dim.score:.1f} / 20" if penalties else "20.0 - 0.0 (no penalties) = 20.0 / 20"
    )
    return dim


def _check_nesting(source: str) -> int:
    """Estimate maximum indentation nesting depth from source code."""
    max_depth = 0
    for line in source.splitlines():
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#") or stripped.startswith("//"):
            continue
        indent = len(line) - len(stripped)
        depth = indent // 4 if "\t" not in line else indent
        max_depth = max(max_depth, depth)
    return max_depth


def _score_complexity(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score code complexity (0–20) based on function length, oversized files, and nesting depth."""
    dim = DimensionScore(
        name="Complexity",
        key="complexity",
        score=20.0,
        max_score=HEALTH_DIMENSION_MAX,
        weight=HEALTH_WEIGHTS["Complexity"],
        starting_score=20.0,
    )
    if not parsed_files:
        dim.formula = "20.0 (empty repository) = 20.0 / 20"
        return dim

    very_long_functions: list[tuple[str, str, int]] = []  # path, name, length
    long_functions: list[tuple[str, str, int]] = []
    deeply_nested_functions: list[tuple[str, str, int]] = []  # path, name, depth
    large_files: list[tuple[str, int]] = []
    total_func_lengths: list[int] = []

    for path, pf in parsed_files.items():
        total_lines = max((func.end_line for func in pf.functions), default=0)
        total_lines = max(total_lines, max((cls.end_line for cls in pf.classes), default=0))
        if total_lines > THRESHOLDS["complexity"]["large_file_lines"]:
            large_files.append((path, total_lines))

        for func in pf.functions:
            length = func.end_line - func.start_line
            total_func_lengths.append(length)
            if length > THRESHOLDS["complexity"]["very_long_function_lines"]:
                very_long_functions.append((path, func.name, length))
            elif length > THRESHOLDS["complexity"]["long_function_lines"]:
                long_functions.append((path, func.name, length))

            if func.source_code:
                depth = _check_nesting(func.source_code)
                if depth > THRESHOLDS["complexity"]["max_nesting_depth"]:
                    deeply_nested_functions.append((path, func.name, depth))

        for cls in pf.classes:
            for method in cls.methods:
                length = method.end_line - method.start_line
                total_func_lengths.append(length)
                if length > THRESHOLDS["complexity"]["very_long_function_lines"]:
                    very_long_functions.append((path, f"{cls.name}.{method.name}", length))
                elif length > THRESHOLDS["complexity"]["long_function_lines"]:
                    long_functions.append((path, f"{cls.name}.{method.name}", length))

                if method.source_code:
                    depth = _check_nesting(method.source_code)
                    if depth > THRESHOLDS["complexity"]["max_nesting_depth"]:
                        deeply_nested_functions.append((path, f"{cls.name}.{method.name}", depth))

    avg_len = sum(total_func_lengths) / len(total_func_lengths) if total_func_lengths else 0.0
    max_len = max(total_func_lengths, default=0)

    # Metrics
    dim.metrics.append(
        MeasuredMetric(
            name="Average Function Length",
            key="average_function_length",
            measured_value=round(avg_len, 1),
            display_value=f"{avg_len:.1f} lines",
            unit="lines",
            threshold=50,
            threshold_display="≤ 50 lines",
            status="good" if avg_len <= 35 else "review" if avg_len <= 50 else "at_risk",
            description="Mean lines of code per function or method across the project.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Maximum Function Length",
            key="max_function_length",
            measured_value=max_len,
            display_value=f"{max_len} lines",
            unit="lines",
            threshold=80,
            threshold_display="≤ 80 lines",
            status="good" if max_len <= 50 else "review" if max_len <= 80 else "at_risk",
            description="Length of the longest function observed in the codebase.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Very Long Functions (>80 lines)",
            key="very_long_functions",
            measured_value=len(very_long_functions),
            display_value=f"{len(very_long_functions)} functions",
            unit="functions",
            threshold=0,
            threshold_display="0 functions",
            status="good" if len(very_long_functions) == 0 else "at_risk",
            description="Functions exceeding 80 lines, creating testing and readability friction.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Oversized Files (>500 lines)",
            key="oversized_files",
            measured_value=len(large_files),
            display_value=f"{len(large_files)} files",
            unit="files",
            threshold=THRESHOLDS["complexity"]["tolerance_large_files"],
            threshold_display=f"≤ {THRESHOLDS['complexity']['tolerance_large_files']} files",
            status="good" if len(large_files) <= 2 else "review",
            description="Files exceeding 500 lines that should be split into smaller modules.",
        )
    )

    dim.metrics.append(
        MeasuredMetric(
            name="Deep Nesting (>5 levels)",
            key="deep_nesting",
            measured_value=len(deeply_nested_functions),
            display_value=f"{len(deeply_nested_functions)} functions",
            unit="functions",
            threshold=0,
            threshold_display="0 functions",
            status="good" if len(deeply_nested_functions) == 0 else "review" if len(deeply_nested_functions) <= 3 else "at_risk",
            description="Functions with deep indentation nesting (>5 levels), increasing cognitive complexity.",
        )
    )

    penalties: list[ScorePenalty] = []

    if len(very_long_functions) > 0:
        pts = min(8.0, float(len(very_long_functions) * 2))
        files = list({item[0] for item in very_long_functions})[:5]
        p = ScorePenalty(
            rule_id="very_long_functions",
            rule_name="Very Long Functions (>80 lines)",
            points_deducted=pts,
            reason=f"{len(very_long_functions)} function(s) exceed 80 lines (-2 pts each, max -8)",
            threshold="≤ 80 lines",
            observed=f"{len(very_long_functions)} exceeding",
            severity="high",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        dim.deductions.append(f"{len(very_long_functions)} functions exceed 80 lines")

    if len(long_functions) > THRESHOLDS["complexity"]["tolerance_long_functions"]:
        pts = min(4.0, float(len(long_functions)))
        files = list({item[0] for item in long_functions})[:5]
        p = ScorePenalty(
            rule_id="long_functions",
            rule_name="Long Functions (51-80 lines)",
            points_deducted=pts,
            reason=f"{len(long_functions)} functions exceed 50 lines (tolerance: 3, max -4)",
            threshold="≤ 50 lines",
            observed=f"{len(long_functions)} exceeding",
            severity="medium",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        dim.deductions.append(f"{len(long_functions)} functions exceed 50 lines")

    if len(large_files) > THRESHOLDS["complexity"]["tolerance_large_files"]:
        pts = min(4.0, float(len(large_files)))
        files = [item[0] for item in large_files][:5]
        p = ScorePenalty(
            rule_id="oversized_files",
            rule_name="Oversized Files (>500 lines)",
            points_deducted=pts,
            reason=f"{len(large_files)} files exceed 500 lines (tolerance: 2, max -4)",
            threshold="≤ 500 lines",
            observed=f"{len(large_files)} exceeding",
            severity="medium",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        dim.deductions.append(f"{len(large_files)} files exceed 500 lines")

    if len(deeply_nested_functions) > 0:
        pts = min(3.0, float(len(deeply_nested_functions) * 1.0))
        files = list({item[0] for item in deeply_nested_functions})[:5]
        p = ScorePenalty(
            rule_id="deep_nesting",
            rule_name="Deep Nesting (>5 levels)",
            points_deducted=pts,
            reason=f"{len(deeply_nested_functions)} function(s) have deep nesting > 5 levels (-1 pt each, max -3)",
            threshold="≤ 5 levels",
            observed=f"{len(deeply_nested_functions)} exceeding",
            severity="medium",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        dim.deductions.append(f"{len(deeply_nested_functions)} functions have deep nesting > 5 levels")

    total_deductions = sum(p.points_deducted for p in penalties)
    dim.total_penalties = total_deductions
    dim.score = max(0.0, round(dim.starting_score - total_deductions, 1))
    dim.status = _status_for_score(dim.score, dim.max_score)
    dim.penalties = penalties

    # Top contributors
    file_penalties: dict[str, list[str]] = {}
    for f_path, fn, func_len in very_long_functions:
        file_penalties.setdefault(f_path, []).append(f"{fn} ({func_len} lines)")
    for f_path, fn, func_len in long_functions:
        file_penalties.setdefault(f_path, []).append(f"{fn} ({func_len} lines)")
    for f_path, fn, depth in deeply_nested_functions:
        file_penalties.setdefault(f_path, []).append(f"{fn} (depth {depth})")
    for f_path, file_line_count in large_files:
        file_penalties.setdefault(f_path, []).append(f"Oversized file ({file_line_count} lines)")

    for path, items in sorted(file_penalties.items(), key=lambda x: len(x[1]), reverse=True)[:5]:
        dim.top_contributors.append(
            FileScoreContribution(
                file_path=path,
                deduction_points=round(min(8.0, len(items) * 1.5), 1),
                finding_count=len(items),
                summary=", ".join(items[:2]) + (f" +{len(items) - 2} more" if len(items) > 2 else ""),
            )
        )

    deduction_str = " - ".join(f"{p.points_deducted:.1f} ({p.rule_name})" for p in penalties)
    dim.formula = (
        f"20.0 - {deduction_str} = {dim.score:.1f} / 20" if penalties else "20.0 - 0.0 (no penalties) = 20.0 / 20"
    )
    return dim


def _score_architecture(
    parsed_files: dict[str, ParsedFile],
    analysis: AnalysisResult | None,
) -> DimensionScore:
    """Score architectural quality (0–20)."""
    dim = DimensionScore(
        name="Architecture",
        key="architecture",
        score=20.0,
        max_score=HEALTH_DIMENSION_MAX,
        weight=HEALTH_WEIGHTS["Architecture"],
        starting_score=20.0,
    )

    cycles = len(analysis.circular_dependencies) if analysis else 0
    dead = len(analysis.dead_code) if analysis else 0

    # High coupling
    coupled_files: list[tuple[str, int]] = []
    for path, pf in parsed_files.items():
        if len(pf.imports) > THRESHOLDS["architecture"]["high_coupling_imports"]:
            coupled_files.append((path, len(pf.imports)))

    # Metrics
    dim.metrics.append(
        MeasuredMetric(
            name="Circular Dependencies",
            key="circular_dependencies",
            measured_value=cycles,
            display_value=f"{cycles} cycles",
            unit="cycles",
            threshold=0,
            threshold_display="0 cycles",
            status="good" if cycles == 0 else "at_risk",
            description="Circular import loops between modules that prevent modular independence.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="Unreferenced Dead Code",
            key="dead_code",
            measured_value=dead,
            display_value=f"{dead} entities",
            unit="entities",
            threshold=THRESHOLDS["architecture"]["tolerance_dead_code"],
            threshold_display=f"≤ {THRESHOLDS['architecture']['tolerance_dead_code']} entities",
            status="good" if dead <= 5 else "review",
            description="Potentially unused functions or classes with zero detected internal references.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="High Module Coupling",
            key="high_module_coupling",
            measured_value=len(coupled_files),
            display_value=f"{len(coupled_files)} modules",
            unit="modules",
            threshold=0,
            threshold_display="0 modules > 15 imports",
            status="good" if len(coupled_files) == 0 else "review",
            description="Modules importing more than 15 other packages or files.",
        )
    )

    penalties: list[ScorePenalty] = []

    if cycles > 0:
        pts = min(8.0, float(cycles * 2))
        cycle_files = []
        if analysis and analysis.circular_dependencies:
            for c in analysis.circular_dependencies:
                if isinstance(c, (list, tuple)):
                    cycle_files.extend(c)
                elif hasattr(c, "cycle"):
                    cycle_files.extend(getattr(c, "cycle", []))
        p = ScorePenalty(
            rule_id="circular_dependencies",
            rule_name="Circular Dependency Chains",
            points_deducted=pts,
            reason=f"{cycles} circular dependency chain(s) detected (-2 pts each, max -8)",
            threshold="0 cycles",
            observed=f"{cycles} cycles",
            severity="critical",
            confidence="high",
            affected_files=list(set(cycle_files))[:5],
        )
        penalties.append(p)
        dim.deductions.append(f"{cycles} circular dependency chain(s) detected")

    if dead > THRESHOLDS["architecture"]["tolerance_dead_code"]:
        pts = min(4.0, float(dead // 2))
        dead_names = [getattr(d, "name", str(d)) for d in (analysis.dead_code if analysis else [])][:5]
        p = ScorePenalty(
            rule_id="dead_code",
            rule_name="Unreferenced Dead Code",
            points_deducted=pts,
            reason=f"{dead} potentially dead code entities (tolerance: 5, -1 pt per 2 entities, max -4)",
            threshold="≤ 5 entities",
            observed=f"{dead} entities",
            severity="medium",
            confidence="medium",
            affected_files=dead_names,
        )
        penalties.append(p)
        dim.deductions.append(f"{dead} potentially dead code entities")

    if coupled_files:
        files = [p[0] for p in coupled_files][:5]
        pts = min(5.0, float(len(coupled_files)))
        p = ScorePenalty(
            rule_id="high_coupling",
            rule_name="High Module Coupling",
            points_deducted=pts,
            reason=f"{len(coupled_files)} module(s) import >15 modules (-1 pt each, max -5)",
            threshold="≤ 15 imports",
            observed=f"{len(coupled_files)} modules",
            severity="medium",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        for path, count in coupled_files[:3]:
            dim.deductions.append(f"{path} has {count} imports (high coupling)")

    total_deductions = sum(p.points_deducted for p in penalties)
    dim.total_penalties = total_deductions
    dim.score = max(0.0, round(dim.starting_score - total_deductions, 1))
    dim.status = _status_for_score(dim.score, dim.max_score)
    dim.penalties = penalties

    # Top contributors
    for path, count in sorted(coupled_files, key=lambda x: x[1], reverse=True)[:5]:
        dim.top_contributors.append(
            FileScoreContribution(
                file_path=path,
                deduction_points=1.0,
                finding_count=count,
                summary=f"Imports {count} dependencies (threshold: 15)",
            )
        )

    deduction_str = " - ".join(f"{p.points_deducted:.1f} ({p.rule_name})" for p in penalties)
    dim.formula = (
        f"20.0 - {deduction_str} = {dim.score:.1f} / 20" if penalties else "20.0 - 0.0 (no penalties) = 20.0 / 20"
    )
    return dim


def _score_maintainability(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score maintainability (0–20)."""
    dim = DimensionScore(
        name="Maintainability",
        key="maintainability",
        score=20.0,
        max_score=HEALTH_DIMENSION_MAX,
        weight=HEALTH_WEIGHTS["Maintainability"],
        starting_score=20.0,
    )
    if not parsed_files:
        dim.formula = "20.0 (empty repository) = 20.0 / 20"
        return dim

    total_funcs = sum(len(pf.functions) + sum(len(c.methods) for c in pf.classes) for pf in parsed_files.values())
    avg_per_file = (total_funcs / len(parsed_files)) if parsed_files else 0.0

    large_classes: list[tuple[str, str, int]] = []
    for path, pf in parsed_files.items():
        for cls in pf.classes:
            if len(cls.methods) > THRESHOLDS["maintainability"]["god_class_methods"]:
                large_classes.append((path, cls.name, len(cls.methods)))

    # Metrics
    dim.metrics.append(
        MeasuredMetric(
            name="Functions Per Module Average",
            key="avg_functions_per_module",
            measured_value=round(avg_per_file, 1),
            display_value=f"{avg_per_file:.1f} funcs/file",
            unit="funcs/file",
            threshold=THRESHOLDS["maintainability"]["max_avg_functions_per_file"],
            threshold_display=f"≤ {THRESHOLDS['maintainability']['max_avg_functions_per_file']:.0f}",
            status="good" if avg_per_file <= 15 else "review",
            description="Mean number of functions and methods defined per file.",
        )
    )
    dim.metrics.append(
        MeasuredMetric(
            name="God Classes (>15 methods)",
            key="god_classes",
            measured_value=len(large_classes),
            display_value=f"{len(large_classes)} classes",
            unit="classes",
            threshold=0,
            threshold_display="0 classes",
            status="good" if len(large_classes) == 0 else "at_risk",
            description="Classes exceeding 15 methods, violating Single Responsibility Principle.",
        )
    )

    penalties: list[ScorePenalty] = []

    if avg_per_file > THRESHOLDS["maintainability"]["max_avg_functions_per_file"]:
        p = ScorePenalty(
            rule_id="high_function_density",
            rule_name="High Function Density",
            points_deducted=5.0,
            reason=f"Average {avg_per_file:.1f} functions per file (threshold: ≤ 15)",
            threshold="≤ 15 funcs/file",
            observed=f"{avg_per_file:.1f}",
            severity="medium",
            confidence="high",
            affected_files=[],
        )
        penalties.append(p)
        dim.deductions.append(f"Average {avg_per_file:.0f} functions per file (consider splitting)")

    if large_classes:
        pts = min(5.0, float(len(large_classes) * 2))
        files = list({item[0] for item in large_classes})[:5]
        p = ScorePenalty(
            rule_id="god_classes",
            rule_name="God Classes (>15 methods)",
            points_deducted=pts,
            reason=f"{len(large_classes)} classes have >15 methods (-2 pts each, max -5)",
            threshold="≤ 15 methods",
            observed=f"{len(large_classes)} classes",
            severity="high",
            confidence="high",
            affected_files=files,
        )
        penalties.append(p)
        dim.deductions.append(f"{len(large_classes)} classes have >15 methods (God class smell)")

    total_deductions = sum(p.points_deducted for p in penalties)
    dim.total_penalties = total_deductions
    dim.score = max(0.0, round(dim.starting_score - total_deductions, 1))
    dim.status = _status_for_score(dim.score, dim.max_score)
    dim.penalties = penalties

    for path, cls_name, m_count in large_classes[:5]:
        dim.top_contributors.append(
            FileScoreContribution(
                file_path=path,
                deduction_points=2.0,
                finding_count=m_count,
                summary=f"class {cls_name} has {m_count} methods",
            )
        )

    deduction_str = " - ".join(f"{p.points_deducted:.1f} ({p.rule_name})" for p in penalties)
    dim.formula = (
        f"20.0 - {deduction_str} = {dim.score:.1f} / 20" if penalties else "20.0 - 0.0 (no penalties) = 20.0 / 20"
    )
    return dim


def _score_security(parsed_files: dict[str, ParsedFile]) -> DimensionScore:
    """Score security practices (0–20)."""
    dim = DimensionScore(
        name="Security",
        key="security",
        score=20.0,
        max_score=HEALTH_DIMENSION_MAX,
        weight=HEALTH_WEIGHTS["Security"],
        starting_score=20.0,
    )

    secrets_found: list[str] = []
    for path in parsed_files:
        try:
            source = Path(path).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            source = ""
        if not source and path in parsed_files:
            source = "\n".join(f.source_code for f in parsed_files[path].functions if f.source_code)

        for pattern in _SECRET_PATTERNS:
            if pattern.search(source):
                secrets_found.append(path)
                break

    dim.metrics.append(
        MeasuredMetric(
            name="Potential Hardcoded Secrets",
            key="hardcoded_secrets",
            measured_value=len(secrets_found),
            display_value=f"{len(secrets_found)} files",
            unit="files",
            threshold=0,
            threshold_display="0 files",
            status="good" if len(secrets_found) == 0 else "at_risk",
            description="Modules containing pattern matches for API keys, private tokens, or hardcoded credentials.",
        )
    )

    penalties: list[ScorePenalty] = []
    if secrets_found:
        pts = min(15.0, float(len(secrets_found) * 5))
        p = ScorePenalty(
            rule_id="hardcoded_secrets",
            rule_name="Hardcoded Secrets Detected",
            points_deducted=pts,
            reason=f"Potential hardcoded secret detected in {len(secrets_found)} file(s) (-5 pts each, max -15)",
            threshold="0 secrets",
            observed=f"{len(secrets_found)} files",
            severity="critical",
            confidence="medium",
            affected_files=secrets_found[:5],
        )
        penalties.append(p)
        for sf in secrets_found:
            dim.deductions.append(f"Potential hardcoded secret detected in {sf}")

    total_deductions = sum(p.points_deducted for p in penalties)
    dim.total_penalties = total_deductions
    dim.score = max(0.0, round(dim.starting_score - total_deductions, 1))
    dim.status = _status_for_score(dim.score, dim.max_score)
    dim.penalties = penalties

    for sf in secrets_found[:5]:
        dim.top_contributors.append(
            FileScoreContribution(
                file_path=sf,
                deduction_points=5.0,
                finding_count=1,
                summary="Potential hardcoded secret or token assignment",
            )
        )

    deduction_str = " - ".join(f"{p.points_deducted:.1f} ({p.rule_name})" for p in penalties)
    dim.formula = (
        f"20.0 - {deduction_str} = {dim.score:.1f} / 20" if penalties else "20.0 - 0.0 (no penalties) = 20.0 / 20"
    )
    return dim


# ── 4. Public API ─────────────────────────────────────────────────────────


def compute_health_score(
    parsed_files: dict[str, ParsedFile],
    analysis: AnalysisResult | None = None,
) -> HealthReport:
    """Compute the full transparent health score for a parsed repository."""
    dimensions = [
        _score_documentation(parsed_files),
        _score_complexity(parsed_files),
        _score_architecture(parsed_files, analysis),
        _score_maintainability(parsed_files),
        _score_security(parsed_files),
    ]

    total = sum(d.score for d in dimensions)

    file_count = len(parsed_files)
    total_lines = 0
    total_funcs = 0
    total_classes = 0
    public_funcs = 0
    doc_funcs = 0
    undoc_funcs = 0
    max_func_len = 0
    longest_func_name = ""
    god_classes_count = 0
    oversized_files_count = 0
    func_lengths: list[int] = []

    for path, pf in parsed_files.items():
        f_max = max((f.end_line for f in pf.functions), default=0)
        c_max = max((c.end_line for c in pf.classes), default=0)
        file_lines = max(f_max, c_max)
        total_lines += file_lines

        if file_lines > THRESHOLDS["complexity"]["large_file_lines"]:
            oversized_files_count += 1

        for f in pf.functions:
            total_funcs += 1
            if not f.name.startswith("_"):
                public_funcs += 1
            if f.docstring:
                doc_funcs += 1
            else:
                undoc_funcs += 1
            flen = f.end_line - f.start_line
            func_lengths.append(flen)
            if flen > max_func_len:
                max_func_len = flen
                longest_func_name = f"{f.name}() in {Path(path).name} ({flen} lines)"

        for c in pf.classes:
            total_classes += 1
            if len(c.methods) > THRESHOLDS["maintainability"]["god_class_methods"]:
                god_classes_count += 1
            for m in c.methods:
                total_funcs += 1
                if not m.name.startswith("_"):
                    public_funcs += 1
                if m.docstring:
                    doc_funcs += 1
                else:
                    undoc_funcs += 1
                mlen = m.end_line - m.start_line
                func_lengths.append(mlen)
                if mlen > max_func_len:
                    max_func_len = mlen
                    longest_func_name = f"{c.name}.{m.name}() in {Path(path).name} ({mlen} lines)"

    all_penalties: list[ScorePenalty] = []
    for dim in dimensions:
        all_penalties.extend(dim.penalties)

    scoring_rules_triggered = len(all_penalties)
    prioritized_actionable = sum(1 for p in all_penalties if p.severity in ("critical", "high"))
    affected_files = len({f for p in all_penalties for f in p.affected_files})

    # Raw code smell signals count (from penalties or estimate)
    raw_signals_estimate = sum(
        (len(p.affected_files) if p.affected_files else 1)
        * (3 if p.severity == "critical" else 2 if p.severity == "high" else 1)
        for p in all_penalties
    )

    issue_counts = IssueCountsSummary(
        raw_signals=max(raw_signals_estimate, scoring_rules_triggered),
        scoring_rules_triggered=scoring_rules_triggered,
        prioritized_actionable=prioritized_actionable,
        files_affected=affected_files,
        explanation=(
            f"{scoring_rules_triggered} scoring deduction rules triggered "
            f"across {affected_files or file_count} files, producing {prioritized_actionable} high-priority actionable issues."
        ),
    )

    avg_f_len = round(sum(func_lengths) / len(func_lengths), 1) if func_lengths else 0.0

    statistics = AnalysisStatistics(
        files_analyzed=file_count,
        total_lines=total_lines,
        total_functions=total_funcs,
        total_classes=total_classes,
        public_functions=public_funcs,
        documented_functions=doc_funcs,
        undocumented_functions=undoc_funcs,
        average_function_length=avg_f_len,
        max_function_length=max_func_len,
        longest_function=longest_func_name or "N/A",
        circular_dependencies=len(analysis.circular_dependencies) if analysis else 0,
        architecture_violations=0,
        potential_secrets=sum(len(p.affected_files) for p in all_penalties if p.rule_id == "hardcoded_secrets"),
        total_code_smells=scoring_rules_triggered,
        god_classes_count=god_classes_count,
        oversized_files_count=oversized_files_count,
    )

    summary_parts = [f"Repository health score: {total:.0f}/100 ({_grade(total)})"]
    if scoring_rules_triggered > 0:
        summary_parts.append(f"{scoring_rules_triggered} issue(s) found across {file_count} files.")
    else:
        summary_parts.append("No significant issues detected.")

    formula_parts = " + ".join(f"{d.name}: {d.score:.0f}/20 ({d.weight * 100:.0f}%)" for d in dimensions)
    scoring_formula = f"Overall Health = {formula_parts} = {total:.0f}/100"

    report = HealthReport(
        total_score=round(total, 1),
        grade=_grade(total),
        dimensions=dimensions,
        summary=" ".join(summary_parts),
        file_count=file_count,
        total_lines=total_lines,
        weights=HEALTH_WEIGHTS,
        scoring_formula=scoring_formula,
        issue_counts=issue_counts,
        statistics=statistics,
    )

    logger.info("Health score computed: %s/100 (%s)", report.total_score, report.grade)
    return report
