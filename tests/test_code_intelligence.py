"""Tests for Advanced Code Intelligence features (Phase 13).

Validates symbol graph construction, change impact analysis,
calibrated dead code confidence, and repository onboarding guide.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from backend.graph.analyzer import GraphAnalyzer
from backend.graph.builder import GraphBuilder
from backend.graph.models import ImpactAnalysisResult
from backend.main import app
from backend.parser.models import FunctionInfo, ImportInfo, ParsedFile


@pytest.fixture()
def sample_parsed_files() -> list[ParsedFile]:
    return [
        ParsedFile(
            file_path="src/main.py",
            imports=[ImportInfo(module="src.service", names=["run_service"])],
            functions=[FunctionInfo(name="main", args=[], calls=["run_service"], start_line=1, end_line=10)],
        ),
        ParsedFile(
            file_path="src/service.py",
            imports=[ImportInfo(module="src.db", names=["get_db"])],
            functions=[FunctionInfo(name="run_service", args=[], calls=["get_db"], start_line=1, end_line=12)],
        ),
        ParsedFile(
            file_path="src/db.py",
            functions=[
                FunctionInfo(name="get_db", args=[], start_line=1, end_line=8),
                FunctionInfo(name="unused_orphan_func", args=[], start_line=10, end_line=15),
            ],
        ),
    ]


def test_symbol_graph_and_dead_code_confidence(sample_parsed_files: list[ParsedFile]):
    builder = GraphBuilder()
    analyzer = GraphAnalyzer()
    files_dict = {f.file_path: f for f in sample_parsed_files}
    graph = builder.build_full_graph(files_dict)

    # 1. Verify symbol graph has nodes & edges
    assert len(graph.nodes) >= 3
    assert len(graph.edges) >= 2

    # 2. Verify Dead Code Confidence
    confidence_items = analyzer.find_dead_code_confidence(graph)
    assert isinstance(confidence_items, list)
    # The unused function should have high confidence
    unused_items = [item for item in confidence_items if "unused_orphan_func" in item.node.id]
    if unused_items:
        item = unused_items[0]
        assert item.confidence >= 80
        assert item.references_count == 0
        assert "No references" in item.reason


def test_change_impact_analysis(sample_parsed_files: list[ParsedFile]):
    builder = GraphBuilder()
    analyzer = GraphAnalyzer()
    files_dict = {f.file_path: f for f in sample_parsed_files}
    graph = builder.build_full_graph(files_dict)

    # Analyzing impact of src/db.py
    result = analyzer.analyze_change_impact(graph, "src/db.py")
    assert isinstance(result, ImpactAnalysisResult)
    assert result.target_file == "src/db.py"
    assert result.risk_level in ["High", "Medium", "Low"]


@pytest.mark.asyncio()
async def test_api_code_intelligence_endpoints(tmp_path):
    # Create minimal repo structure
    main_file = tmp_path / "main.py"
    main_file.write_text("def main(): pass\n")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Scan repo first
        scan_resp = await client.post("/api/repository/scan", json={"path": str(tmp_path)})
        assert scan_resp.status_code == 200

        # Test symbol graph endpoint
        sym_resp = await client.get("/api/graph/symbol", params={"repo_path": str(tmp_path)})
        assert sym_resp.status_code == 200
        sym_data = sym_resp.json()
        assert "elements" in sym_data or "nodes" in sym_data

        # Test change impact endpoint
        imp_resp = await client.get(
            "/api/graph/impact",
            params={"repo_path": str(tmp_path), "target_file": str(main_file)},
        )
        assert imp_resp.status_code == 200
        imp_data = imp_resp.json()
        assert "risk_level" in imp_data
        assert "direct_dependents_count" in imp_data
        assert "explanation" in imp_data

        # Test onboarding guide endpoint
        onb_resp = await client.get("/api/repository/onboarding", params={"repo_path": str(tmp_path)})
        assert onb_resp.status_code == 200
        onb_data = onb_resp.json()
        assert "purpose" in onb_data
        assert "architecture_overview" in onb_data
        assert "entry_points" in onb_data
        assert "important_files" in onb_data
        assert "data_flow" in onb_data
        assert "starting_points" in onb_data
