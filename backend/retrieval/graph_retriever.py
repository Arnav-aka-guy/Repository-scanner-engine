"""Graph-based code retriever utilizing repository relationship graphs."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from backend.graph.service import GraphService

if TYPE_CHECKING:
    import networkx as nx
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


class GraphRetriever:
    """Retrieve structurally related code entities by traversing the dependency/call graph."""

    def __init__(self, graph_service: GraphService) -> None:
        self.graph_service = graph_service

    async def retrieve(
        self,
        entity_names: list[str],
        parsed_files: dict[str, ParsedFile],
        depth: int = 1,
    ) -> list[dict[str, Any]]:
        """Retrieve related code entities by traversing the graph around starting entities.

        Args:
            entity_names: List of class or function/method names to start traversal from.
            parsed_files: Dict of file paths to ParsedFile objects.
            depth: Graph traversal depth.

        Returns:
            List of dictionaries representing related code entities.
        """
        graphs = await self.graph_service.build_graphs(parsed_files)
        full_graph: nx.DiGraph = graphs["full"]

        # 1. Find matching starting nodes in the graph
        start_nodes = []
        for node in full_graph.nodes:
            # Check if node name or id matches any of the entity names
            if any(name.lower() in node.lower() for name in entity_names):
                start_nodes.append(node)

        if not start_nodes:
            return []

        # 2. Perform BFS/DFS traversal up to specified depth
        visited_nodes = set(start_nodes)
        frontier = set(start_nodes)

        for _ in range(depth):
            next_frontier = set()
            for node in frontier:
                # Add successors (outgoing edges: calls, imports, inherits)
                for succ in full_graph.successors(node):
                    if succ not in visited_nodes:
                        next_frontier.add(succ)
                        visited_nodes.add(succ)
                # Add predecessors (incoming edges: callers, users)
                for pred in full_graph.predecessors(node):
                    if pred not in visited_nodes:
                        next_frontier.add(pred)
                        visited_nodes.add(pred)
            frontier = next_frontier
            if not frontier:
                break

        # Remove start nodes to avoid duplicating direct vector search results
        related_nodes = visited_nodes - set(start_nodes)

        # 3. Retrieve node metadata
        results = []
        for node in related_nodes:
            node_attrs = full_graph.nodes[node]
            
            # Map node attributes to search result format
            meta = node_attrs.get("metadata", {})
            results.append({
                "score": 0.5,  # Arbitrary baseline score for graph relevance
                "file_path": node_attrs.get("file_path") or meta.get("file_path", ""),
                "entity_name": node_attrs.get("label") or node,
                "entity_type": node_attrs.get("node_type") or meta.get("entity_type", "function"),
                "source_code": meta.get("source_code") or "",
                "docstring": meta.get("docstring") or "",
                "start_line": meta.get("start_line", 1),
                "end_line": meta.get("end_line", 1),
                "relation_to_query": "Graph connection"
            })

        return results

    async def get_subgraph(
        self,
        center_id: str,
        parsed_files: dict[str, ParsedFile],
        depth: int = 2,
    ) -> dict[str, Any]:
        """Get the subgraph structure surrounding a center node for local visualization.

        Args:
            center_id: The ID of the central node.
            parsed_files: Dict of file paths to ParsedFile.
            depth: Max steps.

        Returns:
            Cytoscape-compatible JSON representing the subgraph.
        """
        graphs = await self.graph_service.build_graphs(parsed_files)
        full_graph: nx.DiGraph = graphs["full"]

        if center_id not in full_graph:
            return {"nodes": [], "edges": []}

        # Collect nodes at depth
        nodes_to_keep = {center_id}
        frontier = {center_id}

        for _ in range(depth):
            next_frontier = set()
            for node in frontier:
                for neighbor in list(full_graph.successors(node)) + list(full_graph.predecessors(node)):
                    if neighbor not in nodes_to_keep:
                        next_frontier.add(neighbor)
                        nodes_to_keep.add(neighbor)
            frontier = next_frontier
            if not frontier:
                break

        subgraph = full_graph.subgraph(nodes_to_keep)
        return self.graph_service._builder.to_cytoscape(subgraph)
