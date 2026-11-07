"""Render a sanitised diagram as Mermaid ``flowchart`` text (for export / exam reports)."""

from __future__ import annotations

from typing import Any

_SHAPES = {
    "database": ('[("', '")]'),
    "vector_store": ('[("', '")]'),
    "storage": ('[("', '")]'),
    "cache": ('[("', '")]'),
    "llm": ('(["', '"])'),
    "external": ('(["', '"])'),
    "security": ('{{"', '"}}'),
}
_CLASS_COLORS = {
    "client": "fill:#1b2a40,stroke:#5B8DEF,color:#E6EAF0",
    "backend": "fill:#1d2420,stroke:#4CAF79,color:#E6EAF0",
    "data": "fill:#13303a,stroke:#7CC4C9,color:#E6EAF0",
    "external": "fill:#2a2238,stroke:#9580CA,color:#E6EAF0",
}


def _esc(text: str) -> str:
    return (
        text.replace('"', "'")
        .replace("<", "‹")
        .replace(">", "›")
        .replace("|", "/")
        .replace("[", "(")
        .replace("]", ")")
        .replace("{", "(")
        .replace("}", ")")
        .replace("\n", " ")
    )


def to_mermaid(diagram: dict[str, Any]) -> str:
    lines = ["flowchart TB"]
    nodes_by_group: dict[str, list[dict[str, Any]]] = {}
    for n in diagram["nodes"]:
        nodes_by_group.setdefault(n["group"], []).append(n)
    for g in diagram["groups"]:
        members = nodes_by_group.get(g["id"], [])
        if not members:
            continue
        lines.append(f'  subgraph {g["id"]}["{_esc(g["label"])}"]')
        lines.append("    direction TB")
        for n in members:
            left, right = _SHAPES.get(n["kind"], ('["', '"]'))
            label = _esc(n["label"])
            if n.get("tech"):
                label += "<br/><small>" + _esc(" · ".join(n["tech"][:3])) + "</small>"
            lines.append(f"    {n['id']}{left}{label}{right}")
        lines.append("  end")
    for e in diagram["edges"]:
        if e.get("label"):
            lines.append(f'  {e["source"]} -->|"{_esc(e["label"])}"| {e["target"]}')
        else:
            lines.append(f"  {e['source']} --> {e['target']}")
    for gid, style in _CLASS_COLORS.items():
        lines.append(f"  classDef {gid} {style}")
    for g in diagram["groups"]:
        ids = [n["id"] for n in nodes_by_group.get(g["id"], [])]
        if ids:
            lines.append(f"  class {','.join(ids)} {g['id']}")
    return "\n".join(lines) + "\n"
