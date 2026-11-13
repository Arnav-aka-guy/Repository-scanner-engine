"""Build NetworkX graphs from parsed source files."""

from __future__ import annotations

import json
import posixpath
import sys
from pathlib import Path, PurePosixPath

import networkx as nx

from backend.graph.models import GraphData, GraphEdge, GraphNode
from backend.parser.models import ParsedFile


class GraphBuilder:
    """Construct various code graphs from parse results."""

    # Dependency graph (file-level imports)

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

    # Call graph (function / method level)

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

    # Full graph (all relationships)

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

    # Serialisation

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

    # Private helpers

    _JS_TS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")

    @classmethod
    def _build_module_index(
        cls,
        parsed_files: dict[str, ParsedFile],
    ) -> dict[str, str]:
        """Map module identifiers to absolute or relative file paths.

        Handles both Python dotted paths (``backend.core.config``) and
        TypeScript/JavaScript slash paths (``./services/api``).
        """
        index: dict[str, str] = {}
        for fpath in parsed_files:
            posix_path = fpath.replace("\\", "/").lower()
            index[posix_path] = fpath
            try:
                p = Path(fpath)
                res_posix = p.resolve().as_posix().lower()
                index[res_posix] = fpath
            except Exception:
                pass

            pure_p = PurePosixPath(posix_path)

            # 1. Python-style dotted module name
            parts = list(pure_p.with_suffix("").parts)
            dotted = ".".join(parts)
            index[dotted] = fpath
            for i in range(1, len(parts)):
                short = ".".join(parts[i:])
                index.setdefault(short, fpath)

            # 2. Bare filename without extension (e.g. "api", "Sidebar")
            stem = pure_p.stem
            index.setdefault(stem, fpath)

            # 3. Slash-based relative-looking paths without extension
            #    e.g. "services/api", "components/Sidebar"
            rel_parts = pure_p.with_suffix("").parts
            for i in range(1, len(rel_parts)):
                slash_path = "/".join(rel_parts[i:])
                index.setdefault(slash_path, fpath)

        return index

    @classmethod
    def _resolve_import(
        cls,
        module: str,
        current_file: str,
        module_index: dict[str, str],
    ) -> str | None:
        """Attempt to resolve a module name to a known file path."""
        if not module:
            return None

        curr_posix = current_file.replace("\\", "/")
        curr_p = PurePosixPath(curr_posix)
        curr_ext = curr_p.suffix.lower()
        is_js_ts = curr_ext in cls._JS_TS_EXTENSIONS or module.startswith(("./", "../", "@/"))

        # TypeScript / JavaScript resolution
        if is_js_ts:
            if not module.startswith((".", "/", "@/")):
                return None

            clean_module = module.rstrip("/")
            candidates: list[PurePosixPath] = []
            if clean_module.startswith((".", "/")):
                candidates.append(curr_p.parent / clean_module)
            elif clean_module.startswith("@/"):
                rel = clean_module[2:]
                roots = cls._find_alias_roots(current_file, module_index)
                for r in roots:
                    candidates.append(r / rel)

            for base in candidates:

                def _check(cand: PurePosixPath) -> str | None:
                    norm = posixpath.normpath(str(cand)).lower()
                    if norm in module_index:
                        t = module_index[norm]
                        if t != current_file and t.replace("\\", "/").lower() != curr_posix.lower():
                            return t
                    try:
                        res = Path(str(cand)).resolve().as_posix().lower()
                        if res in module_index:
                            t = module_index[res]
                            if t != current_file and t.replace("\\", "/").lower() != curr_posix.lower():
                                return t
                    except Exception:
                        pass
                    return None

                # 1. Exact match
                hit = _check(base)
                if hit:
                    return hit

                # 2. Match with extensions (.ts, .tsx, .js, etc.)
                for ext in cls._JS_TS_EXTENSIONS:
                    hit = _check(base.parent / (base.name + ext))
                    if hit:
                        return hit

                # 3. Match /index.* variants
                for ext in cls._JS_TS_EXTENSIONS:
                    hit = _check(base / f"index{ext}")
                    if hit:
                        return hit

            return None

        # Python / other languages resolution
        stdlib_modules = set(getattr(sys, "stdlib_module_names", ())) | set(getattr(sys, "builtin_module_names", ()))
        root_pkg = module.split(".")[0].split("/")[0]
        if root_pkg in stdlib_modules:
            return None

        # 1. Direct lookup
        target = None
        if module in module_index:
            target = module_index[module]

        # 2. Strip leading dots (Python relative import)
        stripped = module.lstrip(".")
        if stripped in module_index:
            return module_index[stripped]

        # 3. Try bare name
        bare = module.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if bare in module_index:
            target = module_index[bare]

        # Prevent reporting a file as importing itself
        if target and (target == current_file or target.replace("\\", "/").lower() == curr_posix.lower()):
            return None

        return target

    @classmethod
    def _find_alias_roots(
        cls,
        current_file: str,
        module_index: dict[str, str],
    ) -> list[PurePosixPath]:
        """Locate base directories for '@/' alias resolution."""
        roots: list[PurePosixPath] = []
        p = Path(current_file)
        try:
            if p.exists():
                curr = p.resolve().parent
                for _ in range(6):
                    if curr == curr.parent:
                        break
                    for cfg_name in ("tsconfig.json", "tsconfig.app.json", "tsconfig.base.json", "jsconfig.json"):
                        cfg_path = curr / cfg_name
                        if cfg_path.exists():
                            try:
                                with open(cfg_path, encoding="utf-8") as f:
                                    data = json.load(f)
                                paths_map = data.get("compilerOptions", {}).get("paths", {})
                                if "@/*" in paths_map:
                                    for target in paths_map["@/*"]:
                                        clean_target = target.rstrip("*").rstrip("/")
                                        target_dir = PurePosixPath((curr / clean_target).resolve().as_posix())
                                        if target_dir not in roots:
                                            roots.append(target_dir)
                            except Exception:
                                pass
                    src_dir = PurePosixPath((curr / "src").resolve().as_posix())
                    if (curr / "src").is_dir() and src_dir not in roots:
                        roots.append(src_dir)
                    curr = curr.parent
        except Exception:
            pass

        posix_file = current_file.replace("\\", "/")
        cf_norm = posix_file.lower()
        if cf_norm.startswith(("src/", "./src/")):
            if PurePosixPath("src") not in roots:
                roots.append(PurePosixPath("src"))
        elif "/src/" in cf_norm:
            prefix = posix_file[: cf_norm.find("/src/") + 4]
            inferred = PurePosixPath(prefix)
            if inferred not in roots:
                roots.append(inferred)

        for val in module_index.values():
            val_posix = val.replace("\\", "/")
            val_norm = val_posix.lower()
            if val_norm.startswith(("src/", "./src/")):
                if PurePosixPath("src") not in roots:
                    roots.append(PurePosixPath("src"))
            elif "/src/" in val_norm:
                prefix = val_posix[: val_norm.find("/src/") + 4]
                inferred = PurePosixPath(prefix)
                if inferred not in roots:
                    roots.append(inferred)

        return roots

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
