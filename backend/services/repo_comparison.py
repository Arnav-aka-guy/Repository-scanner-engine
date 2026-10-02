"""Repository comparison service — compares two repositories side-by-side.

Compares language distributions, file counts, complexity metrics,
and overall health scores between two scanned repositories.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from backend.parser.models import ParsedFile
from backend.services.health_score import compute_health_score
from backend.services.tech_debt import analyse_tech_debt

logger = logging.getLogger(__name__)


@dataclass
class RepoStats:
    """Statistics for a single repository."""

    name: str
    path: str
    file_count: int = 0
    total_lines: int = 0
    function_count: int = 0
    class_count: int = 0
    avg_function_length: float = 0.0
    languages: dict[str, int] = field(default_factory=dict)
    health_score: float = 0.0
    health_grade: str = "?"
    debt_score: float = 0.0
    debt_rating: str = "?"


@dataclass
class ComparisonResult:
    """Result of comparing two repositories."""

    repo_a: RepoStats
    repo_b: RepoStats
    winner: str  # path of the "better" repo by health score
    insights: list[str] = field(default_factory=list)


def _compute_stats(
    name: str,
    path: str,
    parsed_files: dict[str, ParsedFile],
) -> RepoStats:
    """Compute stats for a single repository."""
    stats = RepoStats(name=name, path=path)
    stats.file_count = len(parsed_files)

    total_func_length = 0
    total_funcs = 0
    lang_counts: dict[str, int] = {}

    for _fpath, pf in parsed_files.items():
        lang_counts[pf.language] = lang_counts.get(pf.language, 0) + 1

        for func in pf.functions:
            total_funcs += 1
            total_func_length += func.end_line - func.start_line
            stats.total_lines = max(stats.total_lines, func.end_line)

        for cls in pf.classes:
            stats.class_count += 1
            for method in cls.methods:
                total_funcs += 1
                total_func_length += method.end_line - method.start_line
            stats.total_lines = max(stats.total_lines, cls.end_line)

    stats.function_count = total_funcs
    stats.avg_function_length = round(total_func_length / total_funcs if total_funcs > 0 else 0, 1)
    stats.languages = lang_counts

    # Health score
    health = compute_health_score(parsed_files)
    stats.health_score = health.total_score
    stats.health_grade = health.grade

    # Tech debt
    debt = analyse_tech_debt(parsed_files)
    stats.debt_score = debt.total_debt_score
    stats.debt_rating = debt.debt_rating

    return stats


def compare_repositories(
    parsed_a: dict[str, ParsedFile],
    parsed_b: dict[str, ParsedFile],
    name_a: str = "Repository A",
    name_b: str = "Repository B",
    path_a: str = "",
    path_b: str = "",
) -> ComparisonResult:
    """Compare two parsed repositories and return insights.

    Args:
        parsed_a: Parsed files from repo A.
        parsed_b: Parsed files from repo B.
        name_a: Display name for repo A.
        name_b: Display name for repo B.
        path_a: Path to repo A.
        path_b: Path to repo B.

    Returns:
        ComparisonResult with per-repo stats and insights.
    """
    stats_a = _compute_stats(name_a, path_a, parsed_a)
    stats_b = _compute_stats(name_b, path_b, parsed_b)

    # Determine winner
    winner = path_a if stats_a.health_score >= stats_b.health_score else path_b
    winner_name = name_a if winner == path_a else name_b

    # Generate insights
    insights: list[str] = []

    # Size comparison
    if stats_a.file_count > stats_b.file_count * 1.5:
        insights.append(f"{name_a} is significantly larger ({stats_a.file_count} vs {stats_b.file_count} files)")
    elif stats_b.file_count > stats_a.file_count * 1.5:
        insights.append(f"{name_b} is significantly larger ({stats_b.file_count} vs {stats_a.file_count} files)")

    # Health comparison
    score_diff = abs(stats_a.health_score - stats_b.health_score)
    if score_diff > 15:
        better = name_a if stats_a.health_score > stats_b.health_score else name_b
        insights.append(
            f"{better} has a significantly better health score "
            f"({max(stats_a.health_score, stats_b.health_score):.0f} vs "
            f"{min(stats_a.health_score, stats_b.health_score):.0f})"
        )

    # Complexity comparison
    if stats_a.avg_function_length > 0 and stats_b.avg_function_length > 0:
        if stats_a.avg_function_length > stats_b.avg_function_length * 1.3:
            insights.append(
                f"{name_a} has longer average functions ({stats_a.avg_function_length} vs "
                f"{stats_b.avg_function_length} lines) — may need refactoring"
            )
        elif stats_b.avg_function_length > stats_a.avg_function_length * 1.3:
            insights.append(
                f"{name_b} has longer average functions ({stats_b.avg_function_length} vs "
                f"{stats_a.avg_function_length} lines) — may need refactoring"
            )

    # Debt comparison
    if abs(stats_a.debt_score - stats_b.debt_score) > 10:
        less_debt = name_a if stats_a.debt_score < stats_b.debt_score else name_b
        insights.append(f"{less_debt} has lower technical debt")

    # Language diversity
    if len(stats_a.languages) > len(stats_b.languages) + 2:
        insights.append(f"{name_a} uses more languages ({len(stats_a.languages)} vs {len(stats_b.languages)})")
    elif len(stats_b.languages) > len(stats_a.languages) + 2:
        insights.append(f"{name_b} uses more languages ({len(stats_b.languages)} vs {len(stats_a.languages)})")

    if not insights:
        insights.append("Both repositories have similar characteristics")

    result = ComparisonResult(
        repo_a=stats_a,
        repo_b=stats_b,
        winner=winner,
        insights=insights,
    )

    logger.info(
        "Repository comparison: %s (%s) vs %s (%s) — winner: %s",
        name_a,
        stats_a.health_grade,
        name_b,
        stats_b.health_grade,
        winner_name,
    )
    return result
