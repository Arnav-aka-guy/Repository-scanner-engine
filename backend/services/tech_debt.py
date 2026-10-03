"""Technical Debt Analyzer — detects code smells and quantifies tech debt.

Scans parsed repository files for common code quality issues:
  * Long functions (>50 lines)
  * God classes (>15 methods)
  * Large files (>300 lines)
  * High coupling (>10 imports)
  * Deep nesting (detected via indentation)
  * Missing docstrings
  * TODO/FIXME/HACK comments

Returns a ``TechDebtReport`` with overall debt score, per-file details,
and prioritised remediation suggestions.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile


logger = logging.getLogger(__name__)


@dataclass
class CodeSmell:
    """A single detected code quality issue."""

    category: str  # "long_function", "god_class", "large_file", etc.
    severity: str  # "high", "medium", "low"
    file_path: str
    entity_name: str | None = None
    line: int | None = None
    message: str = ""
    suggestion: str = ""


@dataclass
class FileDebtSummary:
    """Tech debt summary for a single file."""

    path: str
    debt_score: float  # 0-10 per file
    smell_count: int
    smells: list[CodeSmell] = field(default_factory=list)


@dataclass
class TechDebtReport:
    """Full technical debt report for a repository."""

    total_debt_score: float  # 0–100 (lower is better)
    debt_rating: str  # "Low", "Moderate", "High", "Critical"
    total_smells: int
    smells_by_category: dict[str, int] = field(default_factory=dict)
    smells_by_severity: dict[str, int] = field(default_factory=dict)
    top_offenders: list[FileDebtSummary] = field(default_factory=list)
    all_smells: list[CodeSmell] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


# ── Thresholds ──────────────────────────────────────────────────────────

LONG_FUNCTION_LINES = 50
VERY_LONG_FUNCTION_LINES = 80
GOD_CLASS_METHODS = 15
LARGE_FILE_LINES = 300
VERY_LARGE_FILE_LINES = 500
HIGH_COUPLING_IMPORTS = 10
MAX_NESTING_DEPTH = 5

_TODO_PATTERN = re.compile(r"#\s*(TODO|FIXME|HACK|XXX|WORKAROUND)\b", re.I)


def _debt_rating(score: float) -> str:
    """Convert debt score to a human-readable rating."""
    if score <= 15:
        return "Low"
    if score <= 35:
        return "Moderate"
    if score <= 60:
        return "High"
    return "Critical"


def _estimate_lines(pf: ParsedFile) -> int:
    """Estimate total lines in a parsed file from entity positions."""
    max_line = 0
    for func in pf.functions:
        max_line = max(max_line, func.end_line)
    for cls in pf.classes:
        max_line = max(max_line, cls.end_line)
        for method in cls.methods:
            max_line = max(max_line, method.end_line)
    return max_line


def _check_nesting(source: str) -> int:
    """Estimate maximum nesting depth by indentation levels."""
    max_depth = 0
    for line in source.splitlines():
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(stripped)
        # Assume 4-space indent
        depth = indent // 4
        max_depth = max(max_depth, depth)
    return max_depth


def analyse_tech_debt(parsed_files: dict[str, ParsedFile]) -> TechDebtReport:
    """Analyse technical debt across all parsed files.

    Args:
        parsed_files: Dictionary of file paths to ParsedFile objects.

    Returns:
        A TechDebtReport with all detected smells and remediation suggestions.
    """
    all_smells: list[CodeSmell] = []
    file_summaries: dict[str, FileDebtSummary] = {}

    for path, pf in parsed_files.items():
        file_smells: list[CodeSmell] = []

        # ── Large file detection ────────────────────────────────────
        est_lines = _estimate_lines(pf)
        if est_lines > VERY_LARGE_FILE_LINES:
            file_smells.append(
                CodeSmell(
                    category="large_file",
                    severity="high",
                    file_path=path,
                    message=f"File has ~{est_lines} lines (threshold: {VERY_LARGE_FILE_LINES})",
                    suggestion="Split into smaller, focused modules",
                )
            )
        elif est_lines > LARGE_FILE_LINES:
            file_smells.append(
                CodeSmell(
                    category="large_file",
                    severity="medium",
                    file_path=path,
                    message=f"File has ~{est_lines} lines (threshold: {LARGE_FILE_LINES})",
                    suggestion="Consider extracting helper functions or classes",
                )
            )

        # ── High coupling ───────────────────────────────────────────
        if len(pf.imports) > HIGH_COUPLING_IMPORTS:
            file_smells.append(
                CodeSmell(
                    category="high_coupling",
                    severity="medium",
                    file_path=path,
                    message=f"{len(pf.imports)} imports (threshold: {HIGH_COUPLING_IMPORTS})",
                    suggestion="Reduce dependencies; use dependency injection",
                )
            )

        # ── Long functions ──────────────────────────────────────────
        for func in pf.functions:
            length = func.end_line - func.start_line
            if length > VERY_LONG_FUNCTION_LINES:
                file_smells.append(
                    CodeSmell(
                        category="long_function",
                        severity="high",
                        file_path=path,
                        entity_name=func.name,
                        line=func.start_line,
                        message=f"{func.name}() is {length} lines (threshold: {VERY_LONG_FUNCTION_LINES})",
                        suggestion="Extract helper functions to reduce complexity",
                    )
                )
            elif length > LONG_FUNCTION_LINES:
                file_smells.append(
                    CodeSmell(
                        category="long_function",
                        severity="medium",
                        file_path=path,
                        entity_name=func.name,
                        line=func.start_line,
                        message=f"{func.name}() is {length} lines (threshold: {LONG_FUNCTION_LINES})",
                        suggestion="Consider splitting into smaller functions",
                    )
                )

            # Check nesting depth
            if func.source_code:
                depth = _check_nesting(func.source_code)
                if depth > MAX_NESTING_DEPTH:
                    file_smells.append(
                        CodeSmell(
                            category="deep_nesting",
                            severity="medium",
                            file_path=path,
                            entity_name=func.name,
                            line=func.start_line,
                            message=f"{func.name}() has nesting depth {depth} (max: {MAX_NESTING_DEPTH})",
                            suggestion="Use guard clauses or extract methods",
                        )
                    )

            # Missing docstring
            if not func.docstring:
                file_smells.append(
                    CodeSmell(
                        category="missing_docstring",
                        severity="low",
                        file_path=path,
                        entity_name=func.name,
                        line=func.start_line,
                        message=f"{func.name}() lacks a docstring",
                        suggestion="Add a docstring explaining purpose and parameters",
                    )
                )

        # ── God classes & methods ───────────────────────────────────
        for cls in pf.classes:
            if len(cls.methods) > GOD_CLASS_METHODS:
                file_smells.append(
                    CodeSmell(
                        category="god_class",
                        severity="high",
                        file_path=path,
                        entity_name=cls.name,
                        line=cls.start_line,
                        message=f"class {cls.name} has {len(cls.methods)} methods (threshold: {GOD_CLASS_METHODS})",
                        suggestion="Apply Single Responsibility Principle; split into focused classes",
                    )
                )

            if not cls.docstring:
                file_smells.append(
                    CodeSmell(
                        category="missing_docstring",
                        severity="low",
                        file_path=path,
                        entity_name=cls.name,
                        line=cls.start_line,
                        message=f"class {cls.name} lacks a docstring",
                        suggestion="Add a class docstring explaining its responsibility",
                    )
                )

            for method in cls.methods:
                length = method.end_line - method.start_line
                if length > VERY_LONG_FUNCTION_LINES:
                    file_smells.append(
                        CodeSmell(
                            category="long_function",
                            severity="high",
                            file_path=path,
                            entity_name=f"{cls.name}.{method.name}",
                            line=method.start_line,
                            message=f"{cls.name}.{method.name}() is {length} lines",
                            suggestion="Extract helper methods",
                        )
                    )
                elif length > LONG_FUNCTION_LINES:
                    file_smells.append(
                        CodeSmell(
                            category="long_function",
                            severity="medium",
                            file_path=path,
                            entity_name=f"{cls.name}.{method.name}",
                            line=method.start_line,
                            message=f"{cls.name}.{method.name}() is {length} lines",
                            suggestion="Consider splitting into smaller methods",
                        )
                    )

        # ── TODO/FIXME comments across full file ───────────────────
        try:
            file_text = Path(path).read_text(encoding="utf-8", errors="ignore")
            for line_no, line_content in enumerate(file_text.splitlines(), start=1):
                m = _TODO_PATTERN.search(line_content)
                if m:
                    tag = m.group(1).upper()
                    file_smells.append(
                        CodeSmell(
                            category="todo_comment",
                            severity="low",
                            file_path=path,
                            entity_name=None,
                            line=line_no,
                            message=f"{tag} found on line {line_no}: {line_content.strip()[:60]}",
                            suggestion="Resolve or create a tracking issue",
                        )
                    )
        except OSError:
            pass

        # Aggregate for file
        if file_smells:
            debt_per_smell = {"high": 3.0, "medium": 1.5, "low": 0.5}
            score = sum(debt_per_smell.get(s.severity, 0.5) for s in file_smells)
            file_summaries[path] = FileDebtSummary(
                path=path,
                debt_score=round(score, 1),
                smell_count=len(file_smells),
                smells=file_smells,
            )
            all_smells.extend(file_smells)

    # ── Build report ────────────────────────────────────────────────
    smells_by_cat: dict[str, int] = {}
    smells_by_sev: dict[str, int] = {}
    for smell in all_smells:
        smells_by_cat[smell.category] = smells_by_cat.get(smell.category, 0) + 1
        smells_by_sev[smell.severity] = smells_by_sev.get(smell.severity, 0) + 1

    # Score: normalize to 0-100 based on total smells and severity
    raw_score = sum(fs.debt_score for fs in file_summaries.values())
    # Cap at 100
    total_debt = min(100, round(raw_score, 1))

    # Top offenders sorted by debt score
    top = sorted(file_summaries.values(), key=lambda f: f.debt_score, reverse=True)[:10]

    # Generate suggestions
    suggestions: list[str] = []
    if smells_by_cat.get("long_function", 0) > 3:
        suggestions.append(
            f"Refactor {smells_by_cat['long_function']} long functions — extract helper methods and use guard clauses"
        )
    if smells_by_cat.get("god_class", 0) > 0:
        suggestions.append(f"Split {smells_by_cat['god_class']} God class(es) — apply Single Responsibility Principle")
    if smells_by_cat.get("large_file", 0) > 2:
        suggestions.append(f"Break up {smells_by_cat['large_file']} oversized files into focused modules")
    if smells_by_cat.get("missing_docstring", 0) > 5:
        suggestions.append(f"Add docstrings to {smells_by_cat['missing_docstring']} undocumented entities")
    if smells_by_cat.get("high_coupling", 0) > 0:
        suggestions.append("Reduce import coupling — consider dependency injection or facade patterns")

    report = TechDebtReport(
        total_debt_score=total_debt,
        debt_rating=_debt_rating(total_debt),
        total_smells=len(all_smells),
        smells_by_category=smells_by_cat,
        smells_by_severity=smells_by_sev,
        top_offenders=top,
        all_smells=all_smells,
        suggestions=suggestions,
    )

    logger.info(
        "Tech debt analysis: score=%s (%s), %d smells detected",
        report.total_debt_score,
        report.debt_rating,
        report.total_smells,
    )
    return report
