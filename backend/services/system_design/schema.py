"""Pydantic schema and sanitising for system design diagrams.

Every diagram (deterministic or LLM-generated) passes through :func:`sanitize_diagram`
before it is cached or returned, so the frontend can trust the shape:

* ids are short, unique and safe (``[a-z0-9_]``),
* edges and flows only reference existing nodes,
* text is plain, trimmed and length-capped (the UI renders it as text, never as HTML),
* counts are capped so the canvas stays readable.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from backend.services.system_design.builder import GROUP_IDS, GROUPS, NODE_KINDS

MAX_NODES = 45
MAX_EDGES = 90
MAX_FLOWS = 5
MAX_FLOW_STEPS = 9

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_OK = re.compile(r"[^a-z0-9_]+")


class DiagramGroup(BaseModel):
    id: str
    label: str
    description: str = ""


class DiagramNode(BaseModel):
    id: str
    label: str
    kind: str = "module"
    group: str = "backend"
    description: str = ""
    tech: list[str] = Field(default_factory=list)
    paths: list[str] = Field(default_factory=list)


class DiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    kind: str = "dependency"


class DiagramFlow(BaseModel):
    name: str
    steps: list[str]


class SystemDesignDiagram(BaseModel):
    title: str
    summary: str = ""
    groups: list[DiagramGroup]
    nodes: list[DiagramNode]
    edges: list[DiagramEdge]
    flows: list[DiagramFlow] = Field(default_factory=list)
    mermaid: str = ""
    generated_by: str = "analysis"
    detail: str = "overview"
    warnings: list[str] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    generated_at: str = ""
    cache_hit: bool = False


def clean_text(value: Any, limit: int) -> str:
    """Return a single-line-ish, control-character-free string capped at ``limit`` chars."""
    if value is None:
        return ""
    text = _CONTROL.sub("", str(value)).strip()
    text = re.sub(r"[ \t]+", " ", text)
    return text[:limit].rstrip()


def clean_id(value: Any) -> str:
    text = _ID_OK.sub("_", str(value or "").lower()).strip("_")
    return text[:60] or ""


EDGE_KINDS = {"network", "data", "external", "dependency"}


def _edge_kind(given: str, source_group: str, target_group: str) -> str:
    """Use the given edge kind if valid, otherwise infer it from the groups it connects."""
    if given in EDGE_KINDS:
        return given
    if target_group == "data":
        return "data"
    if target_group == "external":
        return "external"
    if source_group == "client" and target_group == "backend":
        return "network"
    return "dependency"


def sanitize_diagram(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalise a diagram dict. Invalid parts are dropped, never trusted."""
    groups_by_id = {g["id"]: dict(g) for g in GROUPS}
    for g in raw.get("groups") or []:
        if isinstance(g, dict) and clean_id(g.get("id")) in GROUP_IDS:
            gid = clean_id(g.get("id"))
            groups_by_id[gid]["label"] = clean_text(g.get("label"), 40) or groups_by_id[gid]["label"]
            groups_by_id[gid]["description"] = clean_text(g.get("description"), 160)

    nodes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for n in raw.get("nodes") or []:
        if not isinstance(n, dict):
            continue
        nid = clean_id(n.get("id"))
        label = clean_text(n.get("label"), 48)
        if not nid or not label or nid in seen:
            continue
        group = clean_id(n.get("group"))
        kind = clean_id(n.get("kind"))
        nodes.append(
            {
                "id": nid,
                "label": label,
                "kind": kind if kind in NODE_KINDS else "module",
                "group": group if group in GROUP_IDS else "backend",
                "description": clean_text(n.get("description"), 320),
                "tech": [clean_text(t, 32) for t in (n.get("tech") or []) if clean_text(t, 32)][:6],
                "paths": [clean_text(p, 160) for p in (n.get("paths") or []) if clean_text(p, 160)][:5],
            }
        )
        seen.add(nid)
        if len(nodes) >= MAX_NODES:
            break

    group_of = {n["id"]: n["group"] for n in nodes}
    edges: list[dict[str, Any]] = []
    edge_keys: set[tuple[str, str]] = set()
    for e in raw.get("edges") or []:
        if not isinstance(e, dict):
            continue
        src, dst = clean_id(e.get("source")), clean_id(e.get("target"))
        if src not in seen or dst not in seen or src == dst or (src, dst) in edge_keys:
            continue
        edge_keys.add((src, dst))
        edges.append(
            {
                "id": f"e_{src}__{dst}",
                "source": src,
                "target": dst,
                "label": clean_text(e.get("label"), 28),
                "kind": _edge_kind(clean_id(e.get("kind")), group_of[src], group_of[dst]),
            }
        )
        if len(edges) >= MAX_EDGES:
            break

    flows: list[dict[str, Any]] = []
    for f in raw.get("flows") or []:
        if not isinstance(f, dict):
            continue
        steps = [clean_id(s) for s in (f.get("steps") or []) if clean_id(s) in seen][:MAX_FLOW_STEPS]
        # drop consecutive duplicates
        steps = [s for i, s in enumerate(steps) if i == 0 or steps[i - 1] != s]
        name = clean_text(f.get("name"), 80)
        if name and len(steps) >= 2:
            flows.append({"name": name, "steps": steps})
        if len(flows) >= MAX_FLOWS:
            break

    used_groups = {n["group"] for n in nodes}
    return {
        "title": clean_text(raw.get("title"), 100) or "System design",
        "summary": clean_text(raw.get("summary"), 700),
        "groups": [groups_by_id[g["id"]] for g in GROUPS if g["id"] in used_groups],
        "nodes": nodes,
        "edges": edges,
        "flows": flows,
    }
