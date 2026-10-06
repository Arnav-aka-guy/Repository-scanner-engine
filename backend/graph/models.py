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


class DeadCodeConfidenceItem(BaseModel):
    """Dead code detection item with confidence score and grounding explanation."""

    node: GraphNode
    confidence: int = Field(..., description="Confidence percentage: e.g. 96")
    reason: str = Field(..., description="Explanation of why this is considered potentially unused")
    references_count: int = 0
    status: str = "Potentially unused"


class ImpactAnalysisResult(BaseModel):
    """Change impact analysis for a specific file or symbol."""

    target_file: str
    risk_level: str  # "High", "Medium", "Low"
    direct_dependents_count: int
    indirect_dependents_count: int
    direct_dependents: list[str] = Field(default_factory=list)
    indirect_dependents: list[str] = Field(default_factory=list)
    most_affected: list[str] = Field(default_factory=list)
    explanation: str = ""


class AnalysisResult(BaseModel):
    """Results from a full graph analysis pass."""

    dead_code: list[GraphNode] = Field(default_factory=list)
    dead_code_confidence: list[DeadCodeConfidenceItem] = Field(default_factory=list)
    circular_dependencies: list[list[str]] = Field(default_factory=list)
    complexity_metrics: dict[str, float | int] = Field(default_factory=dict)
