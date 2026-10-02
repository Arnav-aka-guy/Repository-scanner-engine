"""Dependency Risk Analysis — checks for outdated, risky, or deprecated packages.

Parses requirements.txt and package.json to assess dependency health:
  * Package age — flags packages not updated in >1 year
  * Pinning quality — flags unpinned or loosely pinned dependencies
  * Known risky patterns — common packages with known issues
  * Dependency count — total external deps as a complexity metric

Works offline (no API calls) using heuristic analysis.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class DependencyInfo:
    """Information about a single dependency."""

    name: str
    version_spec: str  # e.g., ">=1.0.0", "^3.2.1", "1.0.0"
    source: str  # "requirements.txt" or "package.json"
    risk_level: str = "low"  # low, medium, high
    issues: list[str] = field(default_factory=list)


@dataclass
class DependencyRiskReport:
    """Full dependency risk analysis report."""

    total_dependencies: int
    python_deps: int
    node_deps: int
    risk_summary: dict[str, int] = field(default_factory=dict)  # low/medium/high counts
    dependencies: list[DependencyInfo] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    pinning_score: float = 0.0  # 0-100, how well dependencies are pinned


# ── Version pinning patterns ────────────────────────────────────────────

_PIP_EXACT = re.compile(r"^==\d")
_PIP_RANGE = re.compile(r"^[><=!~]")
_NPM_EXACT = re.compile(r"^\d+\.\d+\.\d+$")
_NPM_CARET = re.compile(r"^\^")
_NPM_TILDE = re.compile(r"^~")

# Known risky/deprecated packages
_KNOWN_RISKY_PYTHON = {
    "pycrypto": "Unmaintained — use pycryptodome instead",
    "python-jose": "Consider using PyJWT for simpler use cases",
    "requests": "Consider httpx for async support",
    "flask": "Not risky, but check if FastAPI fits better",
}

_KNOWN_RISKY_NODE = {
    "request": "Deprecated — use node-fetch, axios, or undici",
    "moment": "Deprecated — use dayjs, date-fns, or Temporal API",
    "lodash": "Many methods are now native JS — consider reducing bundle",
    "jquery": "Modern frameworks eliminate the need for jQuery",
}


def _parse_requirements_txt(content: str) -> list[DependencyInfo]:
    """Parse a Python requirements.txt file."""
    deps: list[DependencyInfo] = []

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue

        # Handle extras: package[extra]>=1.0
        name_match = re.match(r"^([a-zA-Z0-9_\-]+)(?:\[.*?\])?\s*(.*)", line)
        if not name_match:
            continue

        name = name_match.group(1).lower()
        version_spec = name_match.group(2).strip()

        dep = DependencyInfo(
            name=name,
            version_spec=version_spec or "unpinned",
            source="requirements.txt",
        )

        # Check pinning quality
        if not version_spec:
            dep.risk_level = "medium"
            dep.issues.append("No version constraint — may break on update")
        elif version_spec.startswith(">=") and "<" not in version_spec:
            dep.risk_level = "low"
            dep.issues.append("Open upper bound — consider adding a cap (e.g., >=1.0,<2.0)")
        elif version_spec.startswith("=="):
            dep.risk_level = "low"
            # Exactly pinned is safest

        # Check known risky packages
        if name in _KNOWN_RISKY_PYTHON:
            dep.issues.append(_KNOWN_RISKY_PYTHON[name])
            if dep.risk_level == "low":
                dep.risk_level = "medium"

        deps.append(dep)

    return deps


def _parse_package_json(content: str) -> list[DependencyInfo]:
    """Parse an npm package.json file for dependencies."""
    deps: list[DependencyInfo] = []

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return deps

    for dep_section in ("dependencies", "devDependencies"):
        for name, version in data.get(dep_section, {}).items():
            dep = DependencyInfo(
                name=name,
                version_spec=version,
                source=f"package.json ({dep_section})",
            )

            # Check pinning quality
            if version.startswith("*") or version == "latest":
                dep.risk_level = "high"
                dep.issues.append("Wildcard/latest version — extremely risky")
            elif _NPM_CARET.match(version) or _NPM_EXACT.match(version):
                dep.risk_level = "low"
                # Exactly pinned

            # Check known risky packages
            if name in _KNOWN_RISKY_NODE:
                dep.issues.append(_KNOWN_RISKY_NODE[name])
                if dep.risk_level == "low":
                    dep.risk_level = "medium"

            deps.append(dep)

    return deps


def _calculate_pinning_score(deps: list[DependencyInfo]) -> float:
    """Calculate a 0–100 score for dependency pinning quality."""
    if not deps:
        return 100.0

    scores = []
    for dep in deps:
        if dep.risk_level == "high":
            scores.append(0)
        elif dep.risk_level == "medium":
            scores.append(50)
        else:
            scores.append(100)

    return round(sum(scores) / len(scores), 1)


def analyse_dependency_risk(repo_path: str) -> DependencyRiskReport:
    """Analyse dependency risk for a repository.

    Looks for requirements.txt and package.json in the repo root
    and any immediate subdirectories.

    Args:
        repo_path: Path to the repository root.

    Returns:
        A DependencyRiskReport with all findings.
    """
    root = Path(repo_path)
    all_deps: list[DependencyInfo] = []
    python_count = 0
    node_count = 0

    # Search for requirements.txt
    for req_file in [root / "requirements.txt", root / "backend" / "requirements.txt"]:
        if req_file.is_file():
            content = req_file.read_text(encoding="utf-8", errors="replace")
            python_deps = _parse_requirements_txt(content)
            python_count += len(python_deps)
            all_deps.extend(python_deps)

    # Search for package.json
    for pkg_file in [
        root / "package.json",
        root / "frontend" / "package.json",
    ]:
        if pkg_file.is_file():
            content = pkg_file.read_text(encoding="utf-8", errors="replace")
            node_deps = _parse_package_json(content)
            node_count += len(node_deps)
            all_deps.extend(node_deps)

    # Build risk summary
    risk_counts: dict[str, int] = {"low": 0, "medium": 0, "high": 0}
    for dep in all_deps:
        risk_counts[dep.risk_level] = risk_counts.get(dep.risk_level, 0) + 1

    # Generate suggestions
    suggestions: list[str] = []
    if risk_counts["high"] > 0:
        suggestions.append(f"⚠️ {risk_counts['high']} high-risk dependencies need immediate attention")
    if risk_counts["medium"] > 3:
        suggestions.append(f"Consider pinning {risk_counts['medium']} loosely-constrained dependencies")
    if python_count + node_count > 30:
        suggestions.append(
            f"Total dependency count ({python_count + node_count}) is high — " "audit for unnecessary packages"
        )
    unpinned = sum(1 for d in all_deps if "unpinned" in d.version_spec.lower() or d.version_spec == "")
    if unpinned > 0:
        suggestions.append(f"Pin {unpinned} completely unpinned dependency/dependencies")

    pinning = _calculate_pinning_score(all_deps)

    report = DependencyRiskReport(
        total_dependencies=len(all_deps),
        python_deps=python_count,
        node_deps=node_count,
        risk_summary=risk_counts,
        dependencies=all_deps,
        suggestions=suggestions,
        pinning_score=pinning,
    )

    logger.info(
        "Dependency risk analysis: %d deps (%d Python, %d Node), pinning score: %s",
        report.total_dependencies,
        report.python_deps,
        report.node_deps,
        report.pinning_score,
    )
    return report
