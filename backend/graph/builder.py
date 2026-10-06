"""Build NetworkX graphs from parsed source files."""

from __future__ import annotations

from pathlib import Path

import networkx as nx

from backend.graph.models import GraphData, GraphEdge, GraphNode
from backend.parser.models import ParsedFile


class GraphBuilder:
    """Construct various code graphs from parse results."""

    # ── Dependency graph (file-level imports) ───────────────────────────

    def build_dependency_graph(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> nx.DiGraph:
        """File-level dependency graph based on import statements."""
        g = nx.DiGraph()

        # Index: module-style path → absolute file path
        module_index = self._build_module_index(parsed_files)

        for fpath, pf in parsed_files.items():
            g.add_node(
                fpath,
                label=Path(fpath).name,
                node_type="file",
                file_path=fpath,
            )

            for imp in pf.imports:
                target = self._resolve_import(imp.module, fpath, module_index)
                if target and target in parsed_files:
                    g.add_edge(fpath, target, edge_type="imports")

        return g

    # ── Call graph (function / method level) ─────────────────────────────

    def build_call_graph(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> nx.DiGraph:
        """Function-level call graph across files."""
        g = nx.DiGraph()

        # Build a name → qualified-id index for all defined functions
        func_index: dict[str, str] = {}

        for fpath, pf in parsed_files.items():
            for func in pf.functions:
                fid = f"{fpath}::{func.name}"
                g.add_node(
                    fid,
                    label=func.name,
                    node_type="function",
                    file_path=fpath,
                )
                func_index.setdefault(func.name, fid)

            for cls in pf.classes:
                for method in cls.methods:
                    mid = f"{fpath}::{cls.name}.{method.name}"
                    g.add_node(
                        mid,
                        label=f"{cls.name}.{method.name}",
                        node_type="method",
                        file_path=fpath,
                    )
                    func_index.setdefault(method.name, mid)

        # Wire up call edges
        for fpath, pf in parsed_files.items():
            for func in pf.functions:
                caller = f"{fpath}::{func.name}"
                for call_name in func.calls:
                    callee = func_index.get(call_name)
                    if callee and callee != caller:
                        g.add_edge(caller, callee, edge_type="calls")

            for cls in pf.classes:
                for method in cls.methods:
                    caller = f"{fpath}::{cls.name}.{method.name}"
                    for call_name in method.calls:
                        callee = func_index.get(call_name)
                        if callee and callee != caller:
                            g.add_edge(caller, callee, edge_type="calls")

        return g

    # ── Full graph (all relationships) ──────────────────────────────────

    def build_full_graph(
        self,
        parsed_files: dict[str, ParsedFile],
    ) -> nx.DiGraph:
        """Combined graph with files, classes, functions, and all edges."""
        g = nx.DiGraph()
        module_index = self._build_module_index(parsed_files)
        func_index: dict[str, str] = {}

        for fpath, pf in parsed_files.items():
            # File node
            g.add_node(fpath, label=Path(fpath).name, node_type="file", file_path=fpath)

            # Import edges (File imports File, File imports imported symbols)
            for imp in pf.imports:
                target = self._resolve_import(imp.module, fpath, module_index)
                if target and target in parsed_files:
                    g.add_edge(fpath, target, edge_type="imports")
                for name in imp.names:
                    g.add_edge(fpath, f"{fpath}::import::{name}", edge_type="imports", label=name)
                    g.add_node(f"{fpath}::import::{name}", label=name, node_type="import", file_path=fpath)

            # Top-level functions (File DEFINES function)
            for func in pf.functions:
                fid = f"{fpath}::{func.name}"
                g.add_node(fid, label=func.name, node_type="function", file_path=fpath)
                g.add_edge(fpath, fid, edge_type="defines")
                func_index.setdefault(func.name, fid)

            # Classes + methods (File DEFINES class, class DEFINES/CONTAINS method)
            for cls in pf.classes:
                cid = f"{fpath}::{cls.name}"
                g.add_node(cid, label=cls.name, node_type="class", file_path=fpath)
                g.add_edge(fpath, cid, edge_type="defines")

                # Inheritance & Implementation
                for base in cls.bases:
                    base_id = self._find_class_node(base, parsed_files, fpath)
                    if base_id:
                        edge_kind = (
                            "implements"
                            if "interface" in base.lower() or "protocol" in base.lower() or base.startswith("I")
                            else "inherits"
                        )
                        g.add_edge(cid, base_id, edge_type=edge_kind)
                    else:
                        g.add_node(f"external::{base}", label=base, node_type="class", file_path="")
                        g.add_edge(cid, f"external::{base}", edge_type="inherits")

                for method in cls.methods:
                    mid = f"{fpath}::{cls.name}.{method.name}"
                    g.add_node(mid, label=f"{cls.name}.{method.name}", node_type="method", file_path=fpath)
                    g.add_edge(cid, mid, edge_type="defines")
                    func_index.setdefault(method.name, mid)

        # Call & Reference/Uses edges
        for fpath, pf in parsed_files.items():
            for func in pf.functions:
                caller = f"{fpath}::{func.name}"
                for call_name in func.calls:
                    callee = func_index.get(call_name)
                    if callee and callee != caller:
                        g.add_edge(caller, callee, edge_type="calls")
                    else:
                        # USES symbol
                        g.add_edge(caller, f"ref::{call_name}", edge_type="uses")
                        g.add_node(f"ref::{call_name}", label=call_name, node_type="reference", file_path="")
            for cls in pf.classes:
                for method in cls.methods:
                    caller = f"{fpath}::{cls.name}.{method.name}"
                    for call_name in method.calls:
                        callee = func_index.get(call_name)
                        if callee and callee != caller:
                            g.add_edge(caller, callee, edge_type="calls")
                        else:
                            g.add_edge(caller, f"ref::{call_name}", edge_type="uses")
                            g.add_node(f"ref::{call_name}", label=call_name, node_type="reference", file_path="")

        return g

    # ── Serialisation ───────────────────────────────────────────────────

    @staticmethod
    def to_graph_data(graph: nx.DiGraph) -> GraphData:
        """Convert a NetworkX graph to a serialisable ``GraphData``."""
        nodes = [
            GraphNode(
                id=nid,
                label=data.get("label", nid),
                node_type=data.get("node_type", "unknown"),
                file_path=data.get("file_path", ""),
                metadata={k: v for k, v in data.items() if k not in {"label", "node_type", "file_path"}},
            )
            for nid, data in graph.nodes(data=True)
        ]
        edges = [
            GraphEdge(
                source=u,
                target=v,
                edge_type=data.get("edge_type", "unknown"),
                metadata={k: v_ for k, v_ in data.items() if k != "edge_type"},
            )
            for u, v, data in graph.edges(data=True)
        ]
        return GraphData(nodes=nodes, edges=edges)

    @staticmethod
    def to_cytoscape(graph: nx.DiGraph) -> dict:
        """Convert to Cytoscape.js JSON format."""
        elements: list[dict] = []
        for nid, data in graph.nodes(data=True):
            elements.append(
                {
                    "data": {
                        "id": nid,
                        "label": data.get("label", nid),
                        "node_type": data.get("node_type", "unknown"),
                        **{k: v for k, v in data.items() if k not in {"label", "node_type"}},
                    },
                    "group": "nodes",
                }
            )
        for u, v, data in graph.edges(data=True):
            elements.append(
                {
                    "data": {
                        "source": u,
                        "target": v,
                        "edge_type": data.get("edge_type", "unknown"),
                    },
                    "group": "edges",
                }
            )
        return {"elements": elements}

    # ── Private helpers ─────────────────────────────────────────────────

    @staticmethod
    def _build_module_index(
        parsed_files: dict[str, ParsedFile],
    ) -> dict[str, str]:
        """Map module identifiers to absolute file paths.

        Handles both Python dotted paths (``backend.core.config``) and
        TypeScript/JavaScript slash paths (``./services/api``).
        """
        index: dict[str, str] = {}
        for fpath in parsed_files:
            p = Path(fpath)

            # 1. Python-style dotted module name
            parts = list(p.with_suffix("").parts)
            dotted = ".".join(parts)
            index[dotted] = fpath
            for i in range(1, len(parts)):
                short = ".".join(parts[i:])
                index.setdefault(short, fpath)

            # 2. Bare filename without extension (e.g. "api", "Sidebar")
            stem = p.stem
            index.setdefault(stem, fpath)

            # 3. Slash-based relative-looking paths without extension
            #    e.g. "services/api", "components/Sidebar"
            rel_parts = p.with_suffix("").parts
            for i in range(1, len(rel_parts)):
                slash_path = "/".join(rel_parts[i:])
                index.setdefault(slash_path, fpath)

        return index

    @staticmethod
    def _resolve_import(
        module: str,
        current_file: str,
        module_index: dict[str, str],
    ) -> str | None:
        """Attempt to resolve a module name to a known file path."""
        if not module:
            return None

        # 1. Direct lookup
        if module in module_index:
            return module_index[module]

        # 2. Strip leading dots (Python relative import)
        stripped = module.lstrip(".")
        if stripped in module_index:
            return module_index[stripped]

        # 3. For TS/JS: resolve relative paths like ./services/api or ../hooks/useChat
        if module.startswith("."):
            current_dir = Path(current_file).parent
            # Normalise the path
            resolved = (current_dir / module).resolve()
            resolved_str = str(resolved)

            # Try with common extensions
            for ext in ("", ".ts", ".tsx", ".js", ".jsx", ".py"):
                candidate = resolved_str + ext
                if candidate in module_index.values():
                    return candidate
                # Also try /index variants
                idx_candidate = str(resolved / ("index" + ext)) if not ext else ""
                if idx_candidate and idx_candidate in module_index.values():
                    return idx_candidate

        # 4. Try the last path segment as bare name
        bare = module.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if bare in module_index:
            return module_index[bare]

        return None

    @staticmethod
    def _find_class_node(
        class_name: str,
        parsed_files: dict[str, ParsedFile],
        current_file: str,
    ) -> str | None:
        """Find the graph node ID for a class by name."""
        # Check current file first
        for cls in parsed_files.get(current_file, ParsedFile(file_path="")).classes:
            if cls.name == class_name:
                return f"{current_file}::{class_name}"
        # Then check all files
        for fpath, pf in parsed_files.items():
            for cls in pf.classes:
                if cls.name == class_name:
                    return f"{fpath}::{class_name}"
        return None
