"""Visualization endpoints — Mermaid diagrams and architecture views."""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.api.dependencies import get_graph, get_parser
from backend.graph.models import GraphData, GraphEdge, GraphNode
from backend.parser.models import ParsedFile
from backend.security.path_validator import validate_repository_path

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.graph.service import GraphService
    from backend.parser.service import ParserService

router = APIRouter(prefix="/api/viz", tags=["visualization"])


# ── Constants ────────────────────────────────────────────────────────────

_VALID_GRAPH_TYPES = {"dependency", "call"}

_EDGE_STYLE: dict[str, str] = {
    "imports": "-->",
    "calls": "-.->",
    "inherits": "==>",
    "contains": "--o",
}

# Characters that break Mermaid node labels — replace with underscores.
_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9_]")


# ── Response schemas ────────────────────────────────────────────────────


class MermaidResponse(BaseModel):
    """Response wrapper for a Mermaid diagram string."""

    graph_type: str
    diagram: str


class ArchitectureLayer(BaseModel):
    """A single layer / module in the architecture overview."""

    name: str
    files: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class ArchitectureResponse(BaseModel):
    """High-level architecture diagram data."""

    layers: list[ArchitectureLayer] = Field(default_factory=list)
    diagram: str = ""


# ── Helpers ──────────────────────────────────────────────────────────────


def _safe_id(raw: str) -> str:
    """Convert an arbitrary string into a Mermaid-safe identifier."""
    return _UNSAFE_CHARS.sub("_", raw)


def _graph_to_mermaid(graph_data: GraphData) -> str:
    """Render a GraphData object as a Mermaid ``graph TD`` diagram."""
    lines: list[str] = ["graph TD"]

    # Emit node declarations.
    for node in graph_data.nodes:
        safe = _safe_id(node.id)
        label = node.label.replace('"', "'")
        lines.append(f'    {safe}["{label}"]')

    # Emit edges.
    for edge in graph_data.edges:
        src = _safe_id(edge.source)
        tgt = _safe_id(edge.target)
        arrow = _EDGE_STYLE.get(edge.edge_type, "-->")
        label = edge.edge_type
        lines.append(f"    {src} {arrow}|{label}| {tgt}")

    return "\n".join(lines)


def _build_architecture_layers(
    parsed_files: dict[str, ParsedFile],
    graph_data: GraphData,
) -> list[ArchitectureLayer]:
    """Group files into logical layers (top-level packages)."""
    package_files: dict[str, list[str]] = {}
    for fpath in parsed_files:
        parts = Path(fpath).parts
        package = parts[0] if parts else "root"
        package_files.setdefault(package, []).append(fpath)

    # Build an adjacency set of package-level dependencies from the graph edges.
    package_deps: dict[str, set[str]] = {pkg: set() for pkg in package_files}
    node_to_package: dict[str, str] = {}
    for node in graph_data.nodes:
        parts = Path(node.file_path).parts if node.file_path else ()
        pkg = parts[0] if parts else "root"
        node_to_package[node.id] = pkg

    for edge in graph_data.edges:
        src_pkg = node_to_package.get(edge.source, "")
        tgt_pkg = node_to_package.get(edge.target, "")
        if src_pkg and tgt_pkg and src_pkg != tgt_pkg:
            package_deps.setdefault(src_pkg, set()).add(tgt_pkg)

    layers: list[ArchitectureLayer] = []
    for pkg, files in sorted(package_files.items()):
        layers.append(
            ArchitectureLayer(
                name=pkg,
                files=sorted(files),
                dependencies=sorted(package_deps.get(pkg, set())),
            )
        )

    return layers


def _layers_to_mermaid(layers: list[ArchitectureLayer]) -> str:
    """Render architecture layers as a Mermaid diagram."""
    lines: list[str] = ["graph TD"]

    for layer in layers:
        safe = _safe_id(layer.name)
        file_count = len(layer.files)
        lines.append(f'    {safe}["{layer.name} ({file_count} files)"]')

    for layer in layers:
        src = _safe_id(layer.name)
        for dep in layer.dependencies:
            tgt = _safe_id(dep)
            lines.append(f"    {src} --> {tgt}")

    return "\n".join(lines)


# ── Route handlers ──────────────────────────────────────────────────────


@router.get("/mermaid", response_model=MermaidResponse)
async def mermaid_diagram(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    graph_type: str = Query(
        default="dependency",
        description="Type of graph to render: 'dependency' or 'call'",
    ),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> MermaidResponse:
    """Return a Mermaid diagram string for the requested graph type."""
    if graph_type not in _VALID_GRAPH_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid graph_type '{graph_type}'. Accepted: {sorted(_VALID_GRAPH_TYPES)}",
        )

    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc

    try:
        if graph_type == "dependency":
            graph_data: GraphData = await graph_svc.get_dependency_graph(parsed_files)
        else:
            graph_data = await graph_svc.get_call_graph(parsed_files)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build {graph_type} graph: {exc}",
        ) from exc

    diagram = _graph_to_mermaid(graph_data)

    return MermaidResponse(graph_type=graph_type, diagram=diagram)


@router.get("/architecture", response_model=ArchitectureResponse)
async def architecture_diagram(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
    graph_svc: GraphService = Depends(get_graph),
) -> ArchitectureResponse:
    """Return a high-level architecture overview with a Mermaid diagram."""
    path = validate_repository_path(repo_path)

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse repository: {exc}",
        ) from exc

    try:
        graph_data: GraphData = await graph_svc.get_dependency_graph(parsed_files)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build dependency graph: {exc}",
        ) from exc

    layers = _build_architecture_layers(parsed_files, graph_data)
    diagram = _layers_to_mermaid(layers)

    return ArchitectureResponse(layers=layers, diagram=diagram)
