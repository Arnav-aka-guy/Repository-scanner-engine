"""Pydantic models for graph structures and analysis results."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    """A single node in the code graph."""

    id: str
    label: str
    node_type: str = Field(
        ...,
        description="Node category: 'file', 'class', 'function', or 'method'",
    )
    file_path: str = ""
    metadata: dict[str, str | int | float | bool] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """A directed edge in the code graph."""

    source: str
    target: str
    edge_type: str = Field(
        ...,
        description="Relationship type: 'imports', 'calls', 'inherits', or 'contains'",
    )
    metadata: dict[str, str | int | float | bool] = Field(default_factory=dict)


class GraphData(BaseModel):
    """Serialisable snapshot of a graph."""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class AnalysisResult(BaseModel):
    """Results from a full graph analysis pass."""

    dead_code: list[GraphNode] = Field(default_factory=list)
    circular_dependencies: list[list[str]] = Field(default_factory=list)
    complexity_metrics: dict[str, float | int] = Field(default_factory=dict)
