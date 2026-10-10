"""Domain models for explainable code health scoring and metric tracking."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


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
    """Per-file deduction aggregation showing which files drove the score down."""

    file_path: str
    deduction_points: float
    finding_count: int
    summary: str


@dataclass
class IssueCountsSummary:
    """Reconciliation of signals vs actionable issues."""

    raw_signals: int
    scoring_rules_triggered: int
    prioritized_actionable: int
    files_affected: int
    explanation: str


@dataclass
class AnalysisStatistics:
    """Aggregate structural telemetry for the analyzed codebase."""

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
class Finding:
    """A granular, actionable code finding with exact file location and score effect."""

    id: str
    rule_id: str
    title: str
    file_path: str
    line_number: int
    severity: str  # "critical" | "high" | "medium" | "low"
    confidence: str  # "high" | "medium" | "low"
    score_effect: float
    why_it_matters: str
    dismissed: bool = False
    dismiss_reason: str = ""


@dataclass
class DimensionScore:
    """A single scoring dimension with complete transparency."""

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
    deductions: list[str] = field(default_factory=list)


@dataclass
class HealthReport:
    """Complete transparent health report."""

    total_score: float
    grade: str  # "A" | "B" | "C" | "D" | "E"
    summary: str
    file_count: int
    total_lines: int
    dimensions: list[DimensionScore]
    weights: dict[str, float]
    scoring_formula: str
    statistics: AnalysisStatistics | None = None
    issue_counts: IssueCountsSummary | None = None
    findings: list[Finding] = field(default_factory=list)
    hotspots: list[dict[str, Any]] = field(default_factory=list)
    scoring_version: str = "2.0.0"
    baselines_version: str = "2026.1"
