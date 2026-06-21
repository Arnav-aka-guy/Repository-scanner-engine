"""High-level graph service – building, caching, and analysis."""

from __future__ import annotations

import networkx as nx

from backend.graph.analyzer import GraphAnalyzer
from backend.graph.builder import GraphBuilder
from backend.graph.models import AnalysisResult, GraphData
from backend.parser.models import ParsedFile


class GraphService:
    """Async façade around graph building and analysis."""

    def __init__(self) -> None:
        self._builder = GraphBuilder()
        self._analyzer = GraphAnalyzer()
        self._graph_cache: dict[str, nx.DiGraph] = {}

    # ── Building ────────────────────────────────────────────────────────

    async def build_graphs(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> dict[str, nx.DiGraph]:
        """Build all graph variants and cache them.

        Returns a dict keyed by graph type:
        ``"dependency"``, ``"call"``, ``"full"``.
        """
        cache_key = self._cache_key(parsed_files)

        if cache_key not in self._graph_cache:
            dep = self._builder.build_dependency_graph(parsed_files)
            call = self._builder.build_call_graph(parsed_files)
            full = self._builder.build_full_graph(parsed_files)
            self._graph_cache[f"{cache_key}::dependency"] = dep
            self._graph_cache[f"{cache_key}::call"] = call
            self._graph_cache[f"{cache_key}::full"] = full

        return {
            "dependency": self._graph_cache[f"{cache_key}::dependency"],
            "call": self._graph_cache[f"{cache_key}::call"],
            "full": self._graph_cache[f"{cache_key}::full"],
        }

    async def get_dependency_graph(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> GraphData:
        """Return the file-level dependency graph as ``GraphData``."""
        graphs = await self.build_graphs(parsed_files)
        return self._builder.to_graph_data(graphs["dependency"])

    async def get_call_graph(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> GraphData:
        """Return the function-level call graph as ``GraphData``."""
        graphs = await self.build_graphs(parsed_files)
        return self._builder.to_graph_data(graphs["call"])

    async def get_cytoscape_data(
        self,
        parsed_files: dict[str, ParsedFile],
        graph_type: str = "full",
    ) -> dict:
        """Return graph data in Cytoscape.js JSON format.

        *graph_type* may be ``"dependency"``, ``"call"``, or ``"full"``.
        """
        graphs = await self.build_graphs(parsed_files)
        graph = graphs.get(graph_type, graphs["full"])
        return self._builder.to_cytoscape(graph)

    # ── Analysis ────────────────────────────────────────────────────────

    async def analyze(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> AnalysisResult:
        """Run the full analysis suite on the combined graph."""
        graphs = await self.build_graphs(parsed_files)
        return self._analyzer.full_analysis(graphs["full"])

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _cache_key(parsed_files: dict[str, ParsedFile]) -> str:
        """Derive a stable cache key from the set of file paths."""
        paths = sorted(parsed_files.keys())
        return "|".join(paths)

    def invalidate_cache(self) -> None:
        """Clear all cached graphs."""
        self._graph_cache.clear()
