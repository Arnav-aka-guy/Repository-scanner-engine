"""Static analysis of code graphs."""

from __future__ import annotations

import networkx as nx

from backend.graph.models import AnalysisResult, GraphNode

# Entry-point patterns that should not be flagged as dead code
_ENTRY_POINT_NAMES: set[str] = {
    "main",
    "__main__",
    "app",
    "setup",
    "configure",
    "cli",
    "entrypoint",
}


class GraphAnalyzer:
    """Run various analyses on a NetworkX code graph."""

    # ── Dead code detection ─────────────────────────────────────────────

    def find_dead_code(self, graph: nx.DiGraph) -> list[GraphNode]:
        """Return nodes with zero in-degree that are *not* entry points.

        Entry points are identified by node-type (``file``) and by
        well-known names such as ``main`` or ``__main__``.
        """
        dead: list[GraphNode] = []
        for nid, data in graph.nodes(data=True):
            if graph.in_degree(nid) > 0:
                continue

            node_type = data.get("node_type", "")
            label = data.get("label", "")

            # Files are natural roots – skip them
            if node_type == "file":
                continue

            # Known entry-point names
            base_name = label.split(".")[-1] if "." in label else label
            if base_name.lower() in _ENTRY_POINT_NAMES:
                continue

            # Skip dunder methods (often implicitly called)
            if base_name.startswith("__") and base_name.endswith("__"):
                continue

            dead.append(
                GraphNode(
                    id=nid,
                    label=label,
                    node_type=node_type,
                    file_path=data.get("file_path", ""),
                    metadata={k: v for k, v in data.items() if k not in {"label", "node_type", "file_path"}},
                )
            )
        return dead

    def find_dead_code_confidence(self, graph: nx.DiGraph) -> list[DeadCodeConfidenceItem]:
        """Identify potentially unused nodes with calibrated confidence scores and reasons."""
        from backend.graph.models import DeadCodeConfidenceItem

        raw_nodes = self.find_dead_code(graph)
        items: list[DeadCodeConfidenceItem] = []

        for node in raw_nodes:
            in_deg = graph.in_degree(node.id)
            out_deg = graph.out_degree(node.id)
            label = node.label.lower()

            # Calibrate confidence based on references and naming patterns
            confidence = 96
            reason = "No references or calls found across indexed repository."

            if "test" in label or "mock" in label or "fixture" in label:
                confidence = 65
                reason = "Symbol name suggests test helper or mock fixture."
            elif label.startswith("_"):
                confidence = 92
                reason = "Private/internal symbol with 0 incoming calls or references."
            elif out_deg > 0:
                confidence = 88
                reason = "Symbol invokes other functions but is never invoked externally."
            else:
                confidence = 96
                reason = "No references found across indexed repository."

            items.append(
                DeadCodeConfidenceItem(
                    node=node,
                    confidence=confidence,
                    reason=reason,
                    references_count=in_deg,
                    status="Potentially unused",
                )
            )

        items.sort(key=lambda x: x.confidence, reverse=True)
        return items

    def analyze_change_impact(self, graph: nx.DiGraph, target_file: str) -> ImpactAnalysisResult:
        """Compute direct and indirect dependents and risk level for a target file or symbol."""
        from backend.graph.models import ImpactAnalysisResult

        # Normalize target file matching
        norm_target = target_file.replace("\\", "/").lower()
        matching_nodes = [
            n for n in graph.nodes
            if n.replace("\\", "/").lower() == norm_target or n.replace("\\", "/").lower().endswith(norm_target)
        ]

        if not matching_nodes:
            # Fallback by basename
            base = norm_target.rsplit("/", 1)[-1]
            matching_nodes = [n for n in graph.nodes if base in n.replace("\\", "/").lower()]

        if not matching_nodes:
            return ImpactAnalysisResult(
                target_file=target_file,
                risk_level="Low",
                direct_dependents_count=0,
                indirect_dependents_count=0,
                direct_dependents=[],
                indirect_dependents=[],
                most_affected=[],
                explanation="No dependent relationships found in graph.",
            )

        target_node = matching_nodes[0]
        # Direct dependents: nodes that have an edge pointing TO target_node
        direct = list(graph.predecessors(target_node))

        # Indirect dependents: ancestors in reverse graph
        try:
            reversed_g = graph.reverse()
            descendants = nx.descendants(reversed_g, target_node)
            indirect = [d for d in descendants if d not in direct and d != target_node]
        except Exception:
            indirect = []

        total_affected = len(direct) + len(indirect)
        if total_affected >= 10:
            risk = "High"
            explanation = f"Heavily coupled module ({len(direct)} direct, {len(indirect)} indirect dependents). Changes may trigger cascading regressions."
        elif total_affected >= 3:
            risk = "Medium"
            explanation = f"Moderately coupled module ({len(direct)} direct, {len(indirect)} indirect dependents)."
        else:
            risk = "Low"
            explanation = f"Isolated or leaf module ({len(direct)} direct dependents). Safe to refactor."

        # Compute most affected files/nodes
        most_affected = direct[:5] + indirect[:5]

        return ImpactAnalysisResult(
            target_file=target_file,
            risk_level=risk,
            direct_dependents_count=len(direct),
            indirect_dependents_count=len(indirect),
            direct_dependents=direct,
            indirect_dependents=indirect,
            most_affected=most_affected,
            explanation=explanation,
        )

    @staticmethod
    def find_circular_dependencies(graph: nx.DiGraph) -> list[list[str]]:
        """Return all simple cycles in the graph."""
        try:
            cycles: list[list[str]] = list(nx.simple_cycles(graph))
            return cycles
        except nx.NetworkXError:
            return []

    # ── Complexity metrics ──────────────────────────────────────────────

    @staticmethod
    def get_complexity_metrics(graph: nx.DiGraph) -> dict[str, float | int]:
        """Compute aggregate graph-level metrics."""
        n = graph.number_of_nodes()
        e = graph.number_of_edges()

        if n == 0:
            return {
                "node_count": 0,
                "edge_count": 0,
                "density": 0.0,
                "avg_degree": 0.0,
                "connected_components": 0,
            }

        density = nx.density(graph)
        avg_degree = (2.0 * e) / n if n else 0.0

        # Connected components on the undirected projection
        undirected = graph.to_undirected()
        components = nx.number_connected_components(undirected)

        return {
            "node_count": n,
            "edge_count": e,
            "density": round(density, 6),
            "avg_degree": round(avg_degree, 4),
            "connected_components": components,
        }

    # ── Most connected nodes ────────────────────────────────────────────

    @staticmethod
    def get_most_connected(
        graph: nx.DiGraph,
        top_n: int = 10,
    ) -> list[tuple[str, int]]:
        """Return the *top_n* nodes sorted by total degree (in + out)."""
        degree_pairs: list[tuple[str, int]] = list(graph.degree())
        degree_pairs.sort(key=lambda x: x[1], reverse=True)
        return degree_pairs[:top_n]

    # ── Full analysis ───────────────────────────────────────────────────

    def full_analysis(self, graph: nx.DiGraph) -> AnalysisResult:
        """Run every analysis pass and return a combined result."""
        return AnalysisResult(
            dead_code=self.find_dead_code(graph),
            dead_code_confidence=self.find_dead_code_confidence(graph),
            circular_dependencies=self.find_circular_dependencies(graph),
            complexity_metrics=self.get_complexity_metrics(graph),
        )
