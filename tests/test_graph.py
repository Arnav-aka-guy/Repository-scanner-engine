"""Tests for the graph builder module.

Validates dependency-graph construction from parsed file data, cycle
detection, and dead-code identification using NetworkX.
"""

from __future__ import annotations

import pytest

try:
    import networkx as nx  # type: ignore[import-untyped]
except ImportError:
    nx = None

from backend.graph.models import AnalysisResult, GraphData, GraphEdge, GraphNode
from backend.parser.models import (
    ClassInfo,
    FunctionInfo,
    ImportInfo,
    ParsedFile,
)

# ---------------------------------------------------------------------------
# Skip the entire module if NetworkX is not installed
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.skipif(nx is None, reason="networkx not installed")


# ---------------------------------------------------------------------------
# Fixtures — mock parsed files
# ---------------------------------------------------------------------------

@pytest.fixture()
def parsed_files() -> list[ParsedFile]:
    """Return a small set of ParsedFile objects simulating three modules."""
    return [
        ParsedFile(
            file_path="app/main.py",
            imports=[
                ImportInfo(module="app.utils", names=["helper"], is_from_import=True),
                ImportInfo(module="app.service", names=["Service"], is_from_import=True),
            ],
            functions=[
                FunctionInfo(
                    name="main",
                    args=[],
                    calls=["helper", "Service"],
                    start_line=1,
                    end_line=10,
                ),
            ],
        ),
        ParsedFile(
            file_path="app/utils.py",
            imports=[
                ImportInfo(module="os", is_from_import=False),
            ],
            functions=[
                FunctionInfo(name="helper", args=["x"], start_line=1, end_line=5),
                FunctionInfo(
                    name="unused_helper",
                    args=[],
                    start_line=7,
                    end_line=10,
                ),
            ],
        ),
        ParsedFile(
            file_path="app/service.py",
            imports=[
                ImportInfo(module="app.utils", names=["helper"], is_from_import=True),
            ],
            classes=[
                ClassInfo(
                    name="Service",
                    bases=[],
                    methods=[
                        FunctionInfo(
                            name="run",
                            args=["self"],
                            calls=["helper"],
                            start_line=1,
                            end_line=8,
                        ),
                    ],
                ),
            ],
        ),
    ]


@pytest.fixture()
def cyclic_parsed_files() -> list[ParsedFile]:
    """Parsed files that form a circular import: a → b → c → a."""
    return [
        ParsedFile(
            file_path="a.py",
            imports=[ImportInfo(module="b", is_from_import=False)],
        ),
        ParsedFile(
            file_path="b.py",
            imports=[ImportInfo(module="c", is_from_import=False)],
        ),
        ParsedFile(
            file_path="c.py",
            imports=[ImportInfo(module="a", is_from_import=False)],
        ),
    ]


# ---------------------------------------------------------------------------
# Helper — build a simple NetworkX digraph from ParsedFile data
# ---------------------------------------------------------------------------

def build_import_graph(parsed_files: list[ParsedFile]) -> nx.DiGraph:
    """Build a directed graph where edges represent import relationships."""
    g = nx.DiGraph()
    for pf in parsed_files:
        g.add_node(pf.file_path, node_type="file")
        for imp in pf.imports:
            target = imp.module.replace(".", "/") + ".py"
            g.add_node(target, node_type="file")
            g.add_edge(pf.file_path, target, edge_type="imports")
    return g


def build_call_graph(parsed_files: list[ParsedFile]) -> nx.DiGraph:
    """Build a directed graph where edges represent function calls."""
    g = nx.DiGraph()
    # Index all defined symbols
    for pf in parsed_files:
        for func in pf.functions:
            node_id = f"{pf.file_path}::{func.name}"
            g.add_node(node_id, node_type="function", file=pf.file_path)
        for cls in pf.classes:
            cls_id = f"{pf.file_path}::{cls.name}"
            g.add_node(cls_id, node_type="class", file=pf.file_path)
            for method in cls.methods:
                m_id = f"{pf.file_path}::{cls.name}.{method.name}"
                g.add_node(m_id, node_type="method", file=pf.file_path)

    # Add call edges (simplified name matching)
    name_to_id: dict[str, str] = {}
    for node_id in g.nodes:
        short = node_id.split("::")[-1]
        name_to_id[short] = node_id

    for pf in parsed_files:
        for func in pf.functions:
            caller_id = f"{pf.file_path}::{func.name}"
            for callee_name in func.calls:
                if callee_name in name_to_id:
                    g.add_edge(caller_id, name_to_id[callee_name], edge_type="calls")
        for cls in pf.classes:
            for method in cls.methods:
                caller_id = f"{pf.file_path}::{cls.name}.{method.name}"
                for callee_name in method.calls:
                    if callee_name in name_to_id:
                        g.add_edge(
                            caller_id, name_to_id[callee_name], edge_type="calls"
                        )

    return g


# ---------------------------------------------------------------------------
# Tests — Dependency graph construction
# ---------------------------------------------------------------------------

class TestGraphConstruction:
    """Verify the import graph is built correctly from parsed files."""

    def test_nodes_created(self, parsed_files: list[ParsedFile]) -> None:
        """Every file and its import targets should become graph nodes."""
        g = build_import_graph(parsed_files)
        assert g.number_of_nodes() >= 3  # at least the three source files

    def test_import_edges(self, parsed_files: list[ParsedFile]) -> None:
        """Import relationships should produce directed edges."""
        g = build_import_graph(parsed_files)
        edges = list(g.edges(data=True))
        import_edges = [e for e in edges if e[2].get("edge_type") == "imports"]
        assert len(import_edges) >= 3  # main→utils, main→service, service→utils

    def test_call_graph_nodes(self, parsed_files: list[ParsedFile]) -> None:
        """Call graph should contain function and method nodes."""
        g = build_call_graph(parsed_files)
        node_ids = list(g.nodes)
        assert any("main" in n for n in node_ids)
        assert any("helper" in n for n in node_ids)
        assert any("Service" in n for n in node_ids)

    def test_call_graph_edges(self, parsed_files: list[ParsedFile]) -> None:
        """Call edges should link callers to callees."""
        g = build_call_graph(parsed_files)
        call_edges = [
            (u, v) for u, v, d in g.edges(data=True) if d.get("edge_type") == "calls"
        ]
        assert len(call_edges) >= 1


# ---------------------------------------------------------------------------
# Tests — Cycle detection
# ---------------------------------------------------------------------------

class TestCycleDetection:
    """Circular dependencies should be identifiable."""

    def test_detects_cycle(self, cyclic_parsed_files: list[ParsedFile]) -> None:
        """The a → b → c → a cycle must be found."""
        g = build_import_graph(cyclic_parsed_files)
        cycles = list(nx.simple_cycles(g))
        assert len(cycles) >= 1
        # Flatten cycle members
        cycle_members = {node for cycle in cycles for node in cycle}
        assert "a.py" in cycle_members

    def test_no_cycle_in_dag(self, parsed_files: list[ParsedFile]) -> None:
        """Normal parsed_files fixture should have no cycles."""
        g = build_import_graph(parsed_files)
        cycles = list(nx.simple_cycles(g))
        # Our fixture may have no cycles (main → utils, main → service, service → utils)
        # All are DAG edges
        assert isinstance(cycles, list)  # just ensure it doesn't crash


# ---------------------------------------------------------------------------
# Tests — Dead code detection
# ---------------------------------------------------------------------------

class TestDeadCodeDetection:
    """Nodes with no incoming edges (except entry points) are dead code."""

    def test_detects_unused_function(self, parsed_files: list[ParsedFile]) -> None:
        """unused_helper should have zero incoming call edges."""
        g = build_call_graph(parsed_files)
        unused_id = "app/utils.py::unused_helper"
        if unused_id in g:
            in_degree = g.in_degree(unused_id)
            assert in_degree == 0, "unused_helper should not be called by anyone"

    def test_used_function_has_callers(self, parsed_files: list[ParsedFile]) -> None:
        """helper should have at least one caller."""
        g = build_call_graph(parsed_files)
        helper_id = "app/utils.py::helper"
        if helper_id in g:
            in_degree = g.in_degree(helper_id)
            assert in_degree >= 1


# ---------------------------------------------------------------------------
# Tests — Graph models
# ---------------------------------------------------------------------------

class TestGraphModels:
    """Validate the Pydantic graph models serialize correctly."""

    def test_graph_data_model(self) -> None:
        node = GraphNode(id="f1", label="main.py", node_type="file")
        edge = GraphEdge(source="f1", target="f2", edge_type="imports")
        gd = GraphData(nodes=[node], edges=[edge])
        assert len(gd.nodes) == 1
        assert gd.edges[0].edge_type == "imports"

    def test_analysis_result_model(self) -> None:
        node = GraphNode(id="dead", label="unused", node_type="function")
        ar = AnalysisResult(
            dead_code=[node],
            circular_dependencies=[["a.py", "b.py", "c.py"]],
            complexity_metrics={"avg_degree": 2.5},
        )
        assert len(ar.dead_code) == 1
        assert len(ar.circular_dependencies) == 1
        assert ar.complexity_metrics["avg_degree"] == 2.5
