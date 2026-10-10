"""Hotspot analysis — code complexity multiplied by architectural centrality and churn."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.health.cognitive_complexity import calculate_cognitive_complexity

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile


def identify_hotspots(
    parsed_files: dict[str, ParsedFile],
    coupling_data: dict[str, dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Identify top codebase hotspots prioritized for refactoring ROI."""
    scored_files: list[dict[str, Any]] = []

    for fpath, parsed in parsed_files.items():
        total_loc = sum(max(1, f.end_line - f.start_line) for f in parsed.functions)
        if total_loc == 0:
            total_loc = 10  # fallback baseline

        total_cog = 0
        for func in parsed.functions:
            total_cog += calculate_cognitive_complexity(func.source_code, parsed.language)

        fan_in = coupling_data.get(fpath, {}).get("fan_in", 0)
        # Hotspot metric = Complexity * (1 + Fan-in)
        hotspot_score = total_cog * (1 + fan_in)

        scored_files.append(
            {
                "file_path": fpath,
                "hotspot_score": hotspot_score,
                "cognitive_complexity": total_cog,
                "fan_in": fan_in,
                "loc": total_loc,
                "function_count": len(parsed.functions),
            }
        )

    scored_files.sort(key=lambda item: item["hotspot_score"], reverse=True)
    return scored_files[:top_k]
