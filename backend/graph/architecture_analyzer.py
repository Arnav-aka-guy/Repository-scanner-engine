"""Advanced repository architecture analysis engine.

Detects logical layers, finds circular dependencies, identifies dead code,
computes architectural violations, and produces a health score.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from typing import Any

from backend.graph.models import GraphEdge, GraphNode
from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)

# ── Layer detection heuristics ────────────────────────────────────────────

LAYER_PATTERNS: dict[str, list[str]] = {
    "UI / Presentation": [
        r"(?:^|/)(?:components?|pages?|views?|layouts?|screens?|templates?|widgets?)/",
        r"\.(?:tsx|jsx|vue|svelte|html)$",
    ],
    "API / Routing": [
        r"(?:^|/)(?:api|routes?|routers?|controllers?|endpoints?|handlers?)/",
        r"(?:^|/)(?:middleware|guards?)/",
    ],
    "Business Logic": [
        r"(?:^|/)(?:services?|use_?cases?|domain|logic|managers?|engines?)/",
    ],
    "Data / Persistence": [
        r"(?:^|/)(?:models?|schemas?|repositories?|database|db|store|migrations?|orm)/",
        r"(?:^|/)(?:entities|dao)/",
    ],
    "Infrastructure": [
        r"(?:^|/)(?:config|settings?|utils?|helpers?|lib|common|shared|core)/",
        r"(?:^|/)(?:constants?|types?|enums?|interfaces?)/",
    ],
    "Tests": [
        r"(?:^|/)(?:tests?|__tests__|spec|e2e|integration)/",
        r"(?:_test|_spec|\.test|\.spec)\.",
    ],
}


class ArchitectureReport:
    """Container for architecture analysis results."""

    def __init__(self) -> None:
        self.score: int = 0
        self.layers: dict[str, list[str]] = {}
        self.circular_dependencies: list[list[str]] = []
        self.dead_code: list[dict[str, Any]] = []
        self.violations: list[dict[str, Any]] = []
        self.strengths: list[str] = []
        self.problems: list[str] = []
        self.summary: str = ""
        self.stats: dict[str, Any] = {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "layers": self.layers,
            "circular_dependencies": self.circular_dependencies,
            "dead_code": self.dead_code,
            "violations": self.violations,
            "strengths": self.strengths,
            "problems": self.problems,
            "summary": self.summary,
            "stats": self.stats,
        }


class ArchitectureAnalyzer:
    """Analyzes repository architecture: layers, cycles, dead code, health score."""

    def analyze(
        self,
        parsed_files: dict[str, ParsedFile],
        graph_nodes: list[GraphNode],
        graph_edges: list[GraphEdge],
    ) -> ArchitectureReport:
        """Run full architecture analysis and return a report."""
        report = ArchitectureReport()

        file_paths = list(parsed_files.keys())

        # 1. Detect layers
        report.layers = self._detect_layers(file_paths)

        # 2. Circular dependencies
        report.circular_dependencies = self._find_circular_dependencies(graph_nodes, graph_edges)

        # 3. Dead code
        report.dead_code = self._find_dead_code(graph_nodes, graph_edges)

        # 4. Architectural violations
        report.violations = self._find_violations(report.layers, graph_edges)

        # 5. Compute stats
        report.stats = self._compute_stats(parsed_files, report)

        # 6. Strengths & problems
        report.strengths, report.problems = self._assess(report)

        # 7. Score
        report.score = self._compute_score(report)

        # 8. Summary
        report.summary = self._build_summary(report)

        return report

    # ── Layer detection ───────────────────────────────────────────────

    def _detect_layers(self, file_paths: list[str]) -> dict[str, list[str]]:
        """Classify files into architecture layers using path heuristics."""
        layers: dict[str, list[str]] = defaultdict(list)
        unclassified: list[str] = []

        for path in file_paths:
            # Normalize path separators
            normalized = path.replace("\\", "/")
            matched = False

            for layer_name, patterns in LAYER_PATTERNS.items():
                for pattern in patterns:
                    if re.search(pattern, normalized, re.IGNORECASE):
                        layers[layer_name].append(path)
                        matched = True
                        break
                if matched:
                    break

            if not matched:
                unclassified.append(path)

        if unclassified:
            layers["Unclassified"] = unclassified

        # Sort layers by the expected dependency order
        ordered = {}
        layer_order = [
            "UI / Presentation",
            "API / Routing",
            "Business Logic",
            "Data / Persistence",
            "Infrastructure",
            "Tests",
            "Unclassified",
        ]
        for name in layer_order:
            if name in layers:
                ordered[name] = sorted(layers[name])
        return ordered

    # ── Circular dependency detection ─────────────────────────────────

    def _find_circular_dependencies(
        self,
        nodes: list[GraphNode],
        edges: list[GraphEdge],
    ) -> list[list[str]]:
        """Find circular dependencies using DFS cycle detection."""
        # Build adjacency list (file-level imports only)
        adj: dict[str, set[str]] = defaultdict(set)
        node_ids = {n.id for n in nodes}

        for edge in edges:
            if edge.edge_type in ("imports", "depends") and edge.source in node_ids and edge.target in node_ids:
                adj[edge.source].add(edge.target)

        # DFS-based cycle detection
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {nid: WHITE for nid in node_ids}
        {nid: None for nid in node_ids}
        cycles: list[list[str]] = []

        def dfs(u: str, path: list[str]) -> None:
            color[u] = GRAY
            path.append(u)

            for v in adj.get(u, set()):
                if color.get(v) == GRAY:
                    # Found a cycle — extract it
                    cycle_start = path.index(v)
                    cycle = path[cycle_start:] + [v]
                    # Use labels instead of IDs for readability
                    label_map = {n.id: n.label for n in nodes}
                    cycle_labels = [label_map.get(c, c) for c in cycle]
                    cycles.append(cycle_labels)
                elif color.get(v) == WHITE:
                    dfs(v, path)

            path.pop()
            color[u] = BLACK

        for nid in node_ids:
            if color.get(nid) == WHITE:
                dfs(nid, [])

        # Deduplicate cycles (same cycle can be found from different start nodes)
        seen: set[str] = set()
        unique_cycles: list[list[str]] = []
        for cycle in cycles:
            # Normalize by sorting the cycle canonically
            key = " -> ".join(sorted(set(cycle)))
            if key not in seen:
                seen.add(key)
                unique_cycles.append(cycle)

        return unique_cycles[:20]  # Cap at 20 to avoid noise

    # ── Dead code detection ───────────────────────────────────────────

    def _find_dead_code(
        self,
        nodes: list[GraphNode],
        edges: list[GraphEdge],
    ) -> list[dict[str, Any]]:
        """Identify nodes with zero incoming edges (never referenced)."""
        incoming: dict[str, int] = defaultdict(int)

        for edge in edges:
            incoming[edge.target] += 1

        dead: list[dict[str, Any]] = []
        for node in nodes:
            if node.node_type in ("function", "class", "method") and incoming.get(node.id, 0) == 0:
                # Skip __init__, __main__, test functions, etc.
                if node.label.startswith("__") and node.label.endswith("__"):
                    continue
                if node.label.startswith("test_") or node.label.startswith("Test"):
                    continue
                dead.append(
                    {
                        "id": node.id,
                        "label": node.label,
                        "node_type": node.node_type,
                        "file_path": node.file_path,
                    }
                )

        return dead[:50]  # Cap

    # ── Violation detection ───────────────────────────────────────────

    # Expected dependency direction: UI → API → Business → Data → Infra
    _LAYER_ORDER = {
        "UI / Presentation": 0,
        "API / Routing": 1,
        "Business Logic": 2,
        "Data / Persistence": 3,
        "Infrastructure": 4,
    }

    def _find_violations(
        self,
        layers: dict[str, list[str]],
        edges: list[GraphEdge],
    ) -> list[dict[str, Any]]:
        """Find architectural violations: reverse dependencies between layers."""
        # Build file → layer map
        file_to_layer: dict[str, str] = {}
        for layer_name, files in layers.items():
            for f in files:
                file_to_layer[f] = layer_name

        violations: list[dict[str, Any]] = []

        for edge in edges:
            if edge.edge_type not in ("imports", "depends"):
                continue

            src_layer = file_to_layer.get(edge.source, "")
            tgt_layer = file_to_layer.get(edge.target, "")

            if not src_layer or not tgt_layer or src_layer == tgt_layer:
                continue

            src_order = self._LAYER_ORDER.get(src_layer, -1)
            tgt_order = self._LAYER_ORDER.get(tgt_layer, -1)

            if src_order == -1 or tgt_order == -1:
                continue

            # Violation: lower layer importing from higher layer
            if src_order > tgt_order:
                violations.append(
                    {
                        "source_file": edge.source,
                        "target_file": edge.target,
                        "source_layer": src_layer,
                        "target_layer": tgt_layer,
                        "violation_type": "reverse_dependency",
                        "description": (
                            f"{src_layer} imports from {tgt_layer}. "
                            f"Expected dependency direction is {tgt_layer} → {src_layer}."
                        ),
                    }
                )

        return violations[:30]  # Cap

    # ── Statistics ────────────────────────────────────────────────────

    def _compute_stats(
        self,
        parsed_files: dict[str, ParsedFile],
        report: ArchitectureReport,
    ) -> dict[str, Any]:
        """Compute repository statistics."""
        total_files = len(parsed_files)
        total_classes = 0
        total_functions = 0
        total_methods = 0

        for pf in parsed_files.values():
            total_classes += len(pf.classes)
            total_functions += len(pf.functions)
            for cls in pf.classes:
                total_methods += len(cls.methods)

        return {
            "total_files": total_files,
            "total_classes": total_classes,
            "total_functions": total_functions,
            "total_methods": total_methods,
            "total_layers": len(report.layers),
            "total_circular_deps": len(report.circular_dependencies),
            "total_dead_code": len(report.dead_code),
            "total_violations": len(report.violations),
        }

    # ── Assessment ────────────────────────────────────────────────────

    def _assess(self, report: ArchitectureReport) -> tuple[list[str], list[str]]:
        """Identify strengths and problems from the analysis."""
        strengths: list[str] = []
        problems: list[str] = []

        # Layers
        if len(report.layers) >= 3:
            strengths.append(f"Clear layer separation detected ({len(report.layers)} distinct layers)")
        elif len(report.layers) <= 1:
            problems.append("No clear layer separation. Consider organizing code into layers.")

        # Circular dependencies
        if not report.circular_dependencies:
            strengths.append("No circular dependencies detected — clean dependency graph")
        else:
            count = len(report.circular_dependencies)
            problems.append(
                f"{count} circular dependency cycle(s) found. " "These make the codebase harder to refactor and test."
            )

        # Dead code
        if not report.dead_code:
            strengths.append("No unreferenced code entities detected")
        elif len(report.dead_code) > 10:
            problems.append(
                f"{len(report.dead_code)} unreferenced entities. "
                "Consider removing dead code to reduce maintenance burden."
            )

        # Violations
        if not report.violations:
            strengths.append("No architectural violations — dependency direction is clean")
        else:
            problems.append(
                f"{len(report.violations)} architectural violation(s). "
                "Lower layers should not import from higher layers."
            )

        # File distribution
        unclassified = len(report.layers.get("Unclassified", []))
        total = sum(len(f) for f in report.layers.values())
        if total > 0 and unclassified / total < 0.2:
            strengths.append(f"{100 - int(unclassified / total * 100)}% of files are in recognized layers")

        return strengths, problems

    # ── Score calculation ─────────────────────────────────────────────

    def _compute_score(self, report: ArchitectureReport) -> int:
        """Compute architecture health score (0–100)."""
        score = 100

        # Deductions for circular dependencies (15 points each, max -45)
        score -= min(len(report.circular_dependencies) * 15, 45)

        # Deductions for violations (5 points each, max -25)
        score -= min(len(report.violations) * 5, 25)

        # Deductions for dead code (1 point each, max -15)
        score -= min(len(report.dead_code) * 1, 15)

        # Bonus for good layer separation
        if len(report.layers) >= 3:
            score += 5

        # Penalty for no layer separation
        if len(report.layers) <= 1:
            score -= 10

        return max(0, min(100, score))

    # ── Summary builder ───────────────────────────────────────────────

    def _build_summary(self, report: ArchitectureReport) -> str:
        """Build a human-readable summary of the architecture."""
        lines: list[str] = []

        if report.score >= 80:
            lines.append(f"Architecture Health: EXCELLENT ({report.score}/100)")
        elif report.score >= 60:
            lines.append(f"Architecture Health: GOOD ({report.score}/100)")
        elif report.score >= 40:
            lines.append(f"Architecture Health: FAIR ({report.score}/100)")
        else:
            lines.append(f"Architecture Health: NEEDS ATTENTION ({report.score}/100)")

        stats = report.stats
        lines.append(
            f"Repository contains {stats.get('total_files', 0)} files, "
            f"{stats.get('total_classes', 0)} classes, "
            f"{stats.get('total_functions', 0)} functions across "
            f"{stats.get('total_layers', 0)} detected layers."
        )

        if report.strengths:
            lines.append("\nStrengths:")
            for s in report.strengths:
                lines.append(f"  ✓ {s}")

        if report.problems:
            lines.append("\nAreas for Improvement:")
            for p in report.problems:
                lines.append(f"  ✗ {p}")

        return "\n".join(lines)
