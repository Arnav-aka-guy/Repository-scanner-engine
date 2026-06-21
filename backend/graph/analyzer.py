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
                    metadata={
                        k: v
                        for k, v in data.items()
                        if k not in {"label", "node_type", "file_path"}
                    },
                )
            )
        return dead

    # ── Circular dependencies ───────────────────────────────────────────

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
        degree_pairs: list[tuple[str, int]] = [
            (nid, deg) for nid, deg in graph.degree()
        ]
        degree_pairs.sort(key=lambda x: x[1], reverse=True)
        return degree_pairs[:top_n]

    # ── Full analysis ───────────────────────────────────────────────────

    def full_analysis(self, graph: nx.DiGraph) -> AnalysisResult:
        """Run every analysis pass and return a combined result."""
        return AnalysisResult(
            dead_code=self.find_dead_code(graph),
            circular_dependencies=self.find_circular_dependencies(graph),
            complexity_metrics=self.get_complexity_metrics(graph),
        )
