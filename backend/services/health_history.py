"""Historical Repository Health Analytics & Trend Tracking.

Records health score snapshots over successive repository scans, calculates
trend deltas (score changes, technical debt velocity), identifies degrading
modules, and categorizes new vs. resolved issues.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from backend.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class HealthSnapshot:
    """Historical record of repository health at a specific scan."""

    snapshot_id: str
    timestamp: float
    iso_date: str
    total_score: float
    grade: str
    file_count: int
    total_lines: int
    tech_debt_minutes: float
    dimensions: dict[str, float]
    findings_count: int
    critical_findings_count: int
    findings_keys: list[str] = field(default_factory=list)


@dataclass
class HealthComparisonResult:
    """Detailed delta analysis between two repository scans."""

    baseline_snapshot: HealthSnapshot
    current_snapshot: HealthSnapshot
    score_delta: float
    grade_change: str  # e.g. "B -> A" or "Unchanged"
    tech_debt_delta_minutes: float
    new_findings: list[str]
    resolved_findings: list[str]
    degrading_modules: list[dict[str, Any]]
    improving_modules: list[dict[str, Any]]
    summary: str


class HealthHistoryService:
    """Manages recording, retrieval, and trend analysis of repository health over time."""

    def _get_history_file(self, repo_path: str) -> Path:
        from backend.parser.manifest import get_repo_id

        repo_id = get_repo_id(repo_path)
        return Path(settings.cache_dir) / repo_id / "health_history.json"

    def record_snapshot(
        self,
        repo_path: str,
        health_data: dict[str, Any],
        tech_debt_minutes: float = 0.0,
    ) -> HealthSnapshot:
        """Append a new health score snapshot to repository history."""
        history_file = self._get_history_file(repo_path)
        history_file.parent.mkdir(parents=True, exist_ok=True)

        snapshots = self.get_history(repo_path)

        now = time.time()
        import datetime

        iso_date = datetime.datetime.fromtimestamp(now, tz=datetime.UTC).isoformat()
        snap_id = f"snap_{int(now * 1000)}"

        findings = health_data.get("findings", [])
        findings_keys = [
            f"{f.get('file_path', '')}:{f.get('rule_id', '')}:{f.get('line', 1)}"
            for f in findings
            if isinstance(f, dict)
        ]
        crit_count = sum(
            1 for f in findings if isinstance(f, dict) and f.get("severity", "").lower() in ("critical", "high")
        )

        dim_scores: dict[str, float] = {}
        for d in health_data.get("dimensions", []):
            if isinstance(d, dict) and "key" in d:
                dim_scores[d["key"]] = float(d.get("score", 0.0))

        snapshot = HealthSnapshot(
            snapshot_id=snap_id,
            timestamp=now,
            iso_date=iso_date,
            total_score=float(health_data.get("total_score", 0.0)),
            grade=str(health_data.get("grade", "C")),
            file_count=int(health_data.get("file_count", 0)),
            total_lines=int(health_data.get("total_lines", 0)),
            tech_debt_minutes=tech_debt_minutes,
            dimensions=dim_scores,
            findings_count=len(findings),
            critical_findings_count=crit_count,
            findings_keys=findings_keys,
        )

        # Limit historical snapshots to last 50 per repository
        snapshots_data = [asdict(s) for s in snapshots]
        snapshots_data.append(asdict(snapshot))
        if len(snapshots_data) > 50:
            snapshots_data = snapshots_data[-50:]

        try:
            with open(history_file, "w", encoding="utf-8") as f:
                json.dump(snapshots_data, f, indent=2)
        except Exception as exc:
            logger.warning("Failed saving health history for %s: %s", repo_path, exc)

        return snapshot

    def get_history(self, repo_path: str) -> list[HealthSnapshot]:
        """Load chronological list of health snapshots for *repo_path*."""
        history_file = self._get_history_file(repo_path)
        if not history_file.exists():
            return []

        try:
            with open(history_file, encoding="utf-8") as f:
                raw_list = json.load(f)
            return [HealthSnapshot(**item) for item in raw_list]
        except Exception as exc:
            logger.warning("Failed loading health history for %s: %s", repo_path, exc)
            return []

    def compare_scans(
        self,
        repo_path: str,
        baseline_id: str | None = None,
        current_id: str | None = None,
    ) -> HealthComparisonResult | None:
        """Compare two historical scans, calculating score delta, resolved, and new findings."""
        history = self.get_history(repo_path)
        if len(history) < 2 and (not baseline_id or not current_id):
            return None

        baseline: HealthSnapshot | None = None
        current: HealthSnapshot | None = None

        if baseline_id and current_id:
            for s in history:
                if s.snapshot_id == baseline_id:
                    baseline = s
                if s.snapshot_id == current_id:
                    current = s
        else:
            baseline = history[-2]
            current = history[-1]

        if not baseline or not current:
            return None

        score_delta = round(current.total_score - baseline.total_score, 2)
        grade_change = f"{baseline.grade} -> {current.grade}" if baseline.grade != current.grade else "Unchanged"
        tech_debt_delta = round(current.tech_debt_minutes - baseline.tech_debt_minutes, 1)

        base_keys = set(baseline.findings_keys)
        curr_keys = set(current.findings_keys)

        new_findings = sorted(curr_keys - base_keys)
        resolved_findings = sorted(base_keys - curr_keys)

        # Check dimension degradation
        degrading_modules: list[dict[str, Any]] = []
        improving_modules: list[dict[str, Any]] = []

        for dim_key, curr_score in current.dimensions.items():
            prev_score = baseline.dimensions.get(dim_key, curr_score)
            delta = round(curr_score - prev_score, 1)
            if delta < -2.0:
                degrading_modules.append({"dimension": dim_key, "score_drop": delta})
            elif delta > 2.0:
                improving_modules.append({"dimension": dim_key, "score_gain": delta})

        if score_delta > 0:
            summary = f"Code Health improved by +{score_delta} points ({grade_change}). Resolved {len(resolved_findings)} issues."
        elif score_delta < 0:
            summary = f"Code Health degraded by {score_delta} points ({grade_change}). {len(new_findings)} new issues introduced."
        else:
            summary = f"Code Health remained stable at {current.total_score}/100 ({current.grade})."

        return HealthComparisonResult(
            baseline_snapshot=baseline,
            current_snapshot=current,
            score_delta=score_delta,
            grade_change=grade_change,
            tech_debt_delta_minutes=tech_debt_delta,
            new_findings=new_findings,
            resolved_findings=resolved_findings,
            degrading_modules=degrading_modules,
            improving_modules=improving_modules,
            summary=summary,
        )


# Singleton
_health_history_service: HealthHistoryService | None = None


def get_health_history_service() -> HealthHistoryService:
    """Return singleton HealthHistoryService instance."""
    global _health_history_service  # noqa: PLW0603
    if _health_history_service is None:
        _health_history_service = HealthHistoryService()
    return _health_history_service
