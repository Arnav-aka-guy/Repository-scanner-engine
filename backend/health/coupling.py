"""Coupling metrics — resolved local imports only.

Adheres strictly to Rule 14:
- Counts only resolved local imports.
- Checks Python standard library first (sys.stdlib_module_names and sys.builtin_module_names).
- Excludes third-party installed packages.
- Never reports a file as importing itself.
"""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile


def _get_stdlib_modules() -> set[str]:
    """Return all standard library module names."""
    stdlib = set(getattr(sys, "stdlib_module_names", ())) | set(getattr(sys, "builtin_module_names", ()))
    return stdlib


def compute_local_coupling(
    parsed_files: dict[str, ParsedFile],
) -> dict[str, dict[str, Any]]:
    """Compute fan-in (inward local dependents) and fan-out (outward local dependencies) per file.

    Returns dict mapping file_path -> {
        "fan_out": int,
        "fan_in": int,
        "outward_dependencies": list[str],
        "inward_dependents": list[str],
    }
    """
    stdlib = _get_stdlib_modules()

    # Build index of known local module names to file paths
    # e.g., 'backend.core.models' -> 'backend/core/models.py'
    module_to_file: dict[str, str] = {}
    for fpath in parsed_files:
        norm = fpath.replace("\\", "/").rstrip("/")
        # Strip extension
        stem = norm.rsplit(".", 1)[0]
        # dot-separated notation
        dot_notation = stem.replace("/", ".")
        module_to_file[dot_notation] = fpath
        # Also store filename stem
        file_stem = stem.rsplit("/", 1)[-1]
        module_to_file[file_stem] = fpath

    results: dict[str, dict[str, Any]] = {
        fpath: {
            "fan_out": 0,
            "fan_in": 0,
            "outward_dependencies": [],
            "inward_dependents": [],
        }
        for fpath in parsed_files
    }

    for fpath, parsed in parsed_files.items():
        resolved_deps: set[str] = set()

        for imp in parsed.imports:
            mod = imp.module
            if not mod:
                continue

            root_pkg = mod.split(".")[0].split("/")[0]
            # Exclude standard library
            if root_pkg in stdlib:
                continue

            # Resolve local target
            target_fpath = None
            if mod in module_to_file:
                target_fpath = module_to_file[mod]
            elif root_pkg in module_to_file:
                target_fpath = module_to_file[root_pkg]

            # Self-import check: never report a file importing itself
            if target_fpath and target_fpath != fpath:
                resolved_deps.add(target_fpath)

        results[fpath]["fan_out"] = len(resolved_deps)
        results[fpath]["outward_dependencies"] = sorted(resolved_deps)

        for dep in resolved_deps:
            if dep in results:
                results[dep]["inward_dependents"].append(fpath)
                results[dep]["fan_in"] += 1

    return results
