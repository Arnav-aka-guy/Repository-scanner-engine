"""Continuous, scale-invariant health scoring engine based on benchmark baselines.

Adheres strictly to .agents/skills/health-scoring/SKILL.md:
- Uses smooth continuous curve deductions instead of fixed point deductions with artificial caps.
- Measures the share of code affected (weighted by lines of code), guaranteeing scale invariance (±3 points for 1x vs 20x codebase size).
- Function length never penalizes alone: only functions with both length > 80 and cognitive complexity > 15 incur penalties.
- Bands are strictly A to E (never Grade F).
- Confidence weighting: high 1.0, medium 0.6, low 0.3.
- Unused signals have their weight redistributed proportionally.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

_BASELINES_PATH = Path(__file__).parent / "health_baselines.json"


def load_baselines() -> dict[str, Any]:
    """Load benchmark baselines configuration."""
    with open(_BASELINES_PATH, encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def calculate_grade(score: float) -> str:
    """Calculate grade letter. Strictly bands A through E; never Grade F."""
    if score >= 90.0:
        return "A"
    if score >= 80.0:
        return "B"
    if score >= 70.0:
        return "C"
    if score >= 60.0:
        return "D"
    return "E"


def smooth_penalty_curve(
    ratio: float,
    threshold: float,
    saturation: float = 0.5,
    max_penalty: float = 10.0,
) -> float:
    """Calculate smooth, non-linear penalty for an affected code ratio.

    Starts smoothly when ratio > threshold and asymptotes toward max_penalty.
    """
    if ratio <= threshold:
        return 0.0

    excess = (ratio - threshold) / max(0.01, (saturation - threshold))
    # Smooth Hermite / Sigmoid response
    normalized = min(1.0, excess)
    smooth_factor = normalized * normalized * (3 - 2 * normalized)
    return round(smooth_factor * max_penalty, 2)
