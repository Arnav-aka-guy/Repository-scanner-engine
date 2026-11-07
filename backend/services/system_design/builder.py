"""Turn repository facts into a layered system design diagram (no LLM needed).

The diagram format (JSON) is shared with the LLM enricher and the frontend:

.. code-block:: text

    {
      "title": str, "summary": str,
      "groups": [{"id", "label", "description"}],
      "nodes":  [{"id", "label", "kind", "group", "description", "tech": [str], "paths": [str]}],
      "edges":  [{"id", "source", "target", "label", "kind"}],
      "flows":  [{"name", "steps": [node_id, ...]}],
    }
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from typing import Any

from backend.services.system_design.facts import TECH

GROUPS: list[dict[str, str]] = [
    {"id": "client", "label": "Client", "description": "What the user interacts with"},
    {"id": "backend", "label": "Backend", "description": "Server-side application code"},
    {"id": "data", "label": "Data & Storage", "description": "Where state is kept"},
    {"id": "external", "label": "External Services", "description": "Third-party APIs and models"},
]
GROUP_IDS = {g["id"] for g in GROUPS}

NODE_KINDS = {
    "client",
    "ui",
    "state",
    "api_client",
    "shell",
    "entry",
    "router",
    "security",
    "service",
    "worker",
    "data_access",
    "llm_client",
    "core",
    "module",
    "database",
    "vector_store",
    "cache",
    "storage",
    "queue",
    "llm",
    "external",
}

# folder name -> (label, kind, description)
KNOWN_NAMES: dict[str, tuple[str, str, str]] = {
    "api": ("API routers", "router", "HTTP endpoints exposed to the client"),
    "apis": ("API routers", "router", "HTTP endpoints exposed to the client"),
    "routes": ("Routes", "router", "HTTP route handlers"),
    "routers": ("Routers", "router", "HTTP route handlers"),
    "controllers": ("Controllers", "router", "Request handlers"),
    "endpoints": ("Endpoints", "router", "HTTP route handlers"),
    "views": ("Views", "router", "Request handlers"),
    "security": ("Security layer", "security", "Authentication, authorisation and request guards"),
    "auth": ("Auth", "security", "Authentication and sessions"),
    "middleware": ("Middleware", "security", "Cross-cutting request/response handling"),
    "middlewares": ("Middleware", "security", "Cross-cutting request/response handling"),
    "db": ("Database layer", "data_access", "Models, sessions and queries"),
    "database": ("Database layer", "data_access", "Models, sessions and queries"),
    "models": ("Data models", "data_access", "Persistent data models"),
    "repositories": ("Repositories", "data_access", "Data access objects"),
    "persistence": ("Persistence", "data_access", "Data access"),
    "storage": ("Storage", "data_access", "Reads and writes files, indexes and caches"),
    "llm": ("LLM provider manager", "llm_client", "Talks to large language model APIs"),
    "ai": ("AI layer", "llm_client", "Talks to AI models"),
    "agents": ("Agents", "llm_client", "LLM-driven agents"),
    "providers": ("Providers", "llm_client", "External provider clients"),
    "workers": ("Background workers", "worker", "Long-running background jobs"),
    "jobs": ("Jobs", "worker", "Background jobs"),
    "tasks": ("Tasks", "worker", "Background tasks"),
    "queue": ("Queue", "worker", "Job queue"),
    "parser": ("Parser", "service", "Parses source code into structured data"),
    "parsers": ("Parsers", "service", "Parses input into structured data"),
    "graph": ("Graph engine", "service", "Builds and analyses graphs"),
    "search": ("Search", "service", "Search and ranking"),
    "retrieval": ("Retriever", "service", "Finds relevant context for questions"),
    "embeddings": ("Embeddings", "service", "Turns text/code into vectors"),
    "services": ("Services", "service", "Business logic"),
    "service": ("Services", "service", "Business logic"),
    "health": ("Health analysis", "service", "Code health metrics"),
    "documentation": ("Docs generator", "service", "Generates documentation"),
    "core": ("Core / config", "core", "Configuration and shared building blocks"),
    "config": ("Config", "core", "Configuration"),
    "utils": ("Utilities", "core", "Shared helpers"),
    "common": ("Common", "core", "Shared helpers"),
    "lib": ("Library", "core", "Shared code"),
    "pages": ("Pages", "ui", "Screens the user navigates between"),
    "screens": ("Screens", "ui", "Screens the user navigates between"),
    "components": ("UI components", "ui", "Reusable interface pieces"),
    "layouts": ("Layouts", "ui", "Page shells and navigation"),
    "stores": ("State stores", "state", "Client-side application state"),
    "store": ("State store", "state", "Client-side application state"),
    "state": ("State", "state", "Client-side application state"),
    "hooks": ("Hooks", "state", "Reusable UI logic"),
    "services_client": ("API client", "api_client", "Calls the backend over HTTP"),
    "desktop": ("Desktop shell", "shell", "Native desktop wrapper"),
    "electron": ("Electron shell", "shell", "Native desktop wrapper"),
    "alembic": ("DB migrations", "data_access", "Database schema migrations"),
    "migrations": ("DB migrations", "data_access", "Database schema migrations"),
}

NOISE_NAMES = {"types", "typings", "interfaces", "constants", "styles", "design-system", "theme", "assets", "i18n"}

DATA_CATEGORIES = {"sql_db": "database", "nosql_db": "database", "vector_store": "vector_store", "cache": "cache"}
EXTERNAL_CATEGORIES = {"llm", "git", "cloud", "payments", "search"}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "node"


def _is_client(comp: dict[str, Any]) -> bool:
    path = comp["path"].lower()
    top = path.split("/")[0]
    if top in {"frontend", "client", "web", "ui", "webapp", "desktop", "electron", "mobile"}:
        return True
    if any(p in comp.get("packages", []) for p in ("react", "vue", "svelte", "electron", "next", "@angular/core")):
        return True
    return comp.get("ui_ratio", 0) >= 0.5


def _describe_component(comp_id: str, comp: dict[str, Any], client: bool) -> dict[str, Any]:
    leaf = comp_id.rstrip("/").split("/")[-1]
    name = leaf.lower()
    top = comp_id.split("/")[0]
    if name == "(entry)":
        label, kind, desc = (
            ("App entry", "entry", "Bootstraps the UI and routing")
            if client
            else ("App entry", "entry", "Starts the server and wires routers and middleware")
        )
    elif name == "(other)":
        label, kind, desc = ("Other modules", "module", "Smaller supporting modules")
    elif client and name in {"services", "api", "client", "http"}:
        label, kind, desc = KNOWN_NAMES["services_client"]
    elif name in KNOWN_NAMES:
        label, kind, desc = KNOWN_NAMES[name]
    elif comp_id == "root":
        label, kind, desc = ("Root scripts", "module", "Top-level source files")
    else:
        label, kind, desc = (leaf.replace("_", " ").replace("-", " ").title(), "module", "")
    if client and kind in {"module", "core"}:
        kind = "ui" if comp.get("ui_ratio", 0) >= 0.5 else "client"
    if top in {"desktop", "electron"} or "electron" in comp.get("packages", []):
        label, kind, desc = ("Desktop shell (Electron)", "shell", "Native desktop window that hosts the UI")
    if client and kind == "module" and comp_id.split("/")[0] == comp_id:
        label = f"{label} app"

    tech = []
    for pkg in comp.get("packages", []):
        if pkg in TECH and TECH[pkg][0] not in tech:
            tech.append(TECH[pkg][0])
    detail = f"{comp['file_count']} source files"
    langs = ", ".join(list(comp.get("languages", {}))[:2])
    if langs:
        detail += f" ({langs})"
    return {
        "id": _slug(comp_id),
        "label": label,
        "kind": kind,
        "group": "client" if client else "backend",
        "description": f"{desc}. {detail}." if desc else f"{detail}.",
        "tech": tech[:5],
        "paths": [comp["path"], *comp.get("sample_files", [])[:3]],
        "_comp": comp_id,
        "_weight": comp["file_count"],
    }


def build_diagram(facts: dict[str, Any], detail: str = "overview") -> dict[str, Any]:
    """Build a deterministic, evidence-based system design diagram from repository facts."""
    detailed = detail == "detailed"
    comps: dict[str, dict[str, Any]] = facts.get("components", {})

    nodes: dict[str, dict[str, Any]] = {}
    comp_to_node: dict[str, str] = {}

    candidates = []
    for comp_id, comp in comps.items():
        leaf = comp_id.split("/")[-1].lower()
        if leaf in NOISE_NAMES:
            continue
        if not detailed and (leaf == "(other)" or comp["file_count"] < 2):
            continue
        client = _is_client(comp)
        candidates.append(_describe_component(comp_id, comp, client))

    caps = {"client": 10 if detailed else 5, "backend": 22 if detailed else 10}
    for group in ("client", "backend"):
        priority = {"shell": 0, "entry": 1, "api_client": 1, "router": 1, "security": 1, "llm_client": 2}
        group_nodes = sorted(
            (n for n in candidates if n["group"] == group),
            key=lambda n: (priority.get(n["kind"], 5), -n["_weight"]),
        )
        for n in group_nodes[: caps[group]]:
            # make labels unique
            base = n["label"]
            i = 2
            while any(existing["label"] == n["label"] for existing in nodes.values()):
                n["label"] = f"{base} ({n['_comp'].split('/')[0]})" if i == 2 else f"{base} {i}"
                i += 1
            nodes[n["id"]] = n
            comp_to_node[n["_comp"]] = n["id"]

    edges: dict[tuple[str, str], dict[str, Any]] = {}

    def add_edge(src: str, dst: str, label: str = "", kind: str = "dependency", weight: int = 1) -> None:
        if src == dst or src not in nodes or dst not in nodes:
            return
        key = (src, dst)
        if key in edges:
            edges[key]["_weight"] += weight
            return
        edges[key] = {
            "id": f"e_{src}__{dst}",
            "source": src,
            "target": dst,
            "label": label,
            "kind": kind,
            "_weight": weight,
        }

    # code dependencies between components
    per_source_cap = 4 if detailed else 2
    out_count: dict[str, int] = defaultdict(int)
    core_nodes = {nid for nid, n in nodes.items() if n["kind"] == "core"}
    for e in facts.get("component_edges", []):
        src = comp_to_node.get(e["source"])
        dst = comp_to_node.get(e["target"])
        if not src or not dst:
            continue
        if dst in core_nodes:
            continue
        if nodes[src]["group"] != nodes[dst]["group"] and not detailed:
            continue
        if out_count[src] >= per_source_cap:
            continue
        add_edge(src, dst, weight=e.get("weight", 1))
        out_count[src] += 1

    # technologies
    techs = facts.get("technologies", [])

    def tech_names(category: str) -> list[dict[str, Any]]:
        return [t for t in techs if t["category"] == category]

    def users_of(entries: list[dict[str, Any]], fallback_kinds: tuple[str, ...]) -> list[str]:
        users: list[str] = []
        for t in entries:
            for comp in t.get("used_by", []):
                nid = comp_to_node.get(comp)
                if nid and nid not in users:
                    users.append(nid)
        if not users:
            for kind in fallback_kinds:
                users = [nid for nid, n in nodes.items() if n["kind"] == kind and n["group"] == "backend"]
                if users:
                    break
        return users[: 4 if detailed else 2]

    def add_node(node_id: str, label: str, kind: str, group: str, description: str, tech: list[str]) -> str:
        nodes[node_id] = {
            "id": node_id,
            "label": label,
            "kind": kind,
            "group": group,
            "description": description,
            "tech": tech,
            "paths": [],
            "_weight": 0,
        }
        return node_id

    # SQL database
    sql = tech_names("sql_db")
    orm = tech_names("orm") + tech_names("migrations")
    if sql or orm:
        names = sorted({t["name"] for t in sql}) or ["SQL"]
        nid = add_node(
            "store_sql",
            f"SQL database ({' / '.join(names)})" if sql else "SQL database",
            "database",
            "data",
            "Relational data: " + ", ".join(t["evidence"][0] for t in (sql or orm)[:2]),
            names + [t["name"] for t in orm[:1]],
        )
        for user in users_of(sql + orm, ("data_access", "entry")):
            add_edge(user, nid, "SQL", "data")
    for t in tech_names("nosql_db")[:1]:
        nid = add_node("store_nosql", t["name"], "database", "data", "Document database", [t["name"]])
        for user in users_of([t], ("data_access", "entry")):
            add_edge(user, nid, "queries", "data")
    vec = tech_names("vector_store")
    if vec:
        nid = add_node(
            "store_vector",
            f"Vector index ({vec[0]['name']})",
            "vector_store",
            "data",
            "Stores embeddings for semantic search",
            [t["name"] for t in vec],
        )
        for user in users_of(vec, ("service",)):
            add_edge(user, nid, "vectors", "data")
    for t in tech_names("cache")[:1]:
        nid = add_node("store_cache", f"Cache ({t['name']})", "cache", "data", "Fast key-value cache", [t["name"]])
        for user in users_of([t], ("service", "entry")):
            add_edge(user, nid, "cache", "data")
    storage_nodes = [
        nid for nid, n in nodes.items() if n.get("_comp", "").split("/")[-1].lower() in {"storage", "cache"}
    ]
    if storage_nodes:
        nid = add_node(
            "store_disk",
            "Local disk (indexes, cache)",
            "storage",
            "data",
            "Files written by the app: indexes, caches and generated output",
            [],
        )
        for user in storage_nodes:
            add_edge(user, nid, "read / write", "data")
        if "store_vector" in nodes:
            add_edge("store_vector", nid, "persisted to", "data")
    for t in tech_names("queue")[:1]:
        nid = add_node("svc_queue", t["name"], "queue", "data", "Message / job queue", [t["name"]])
        for user in users_of([t], ("worker", "service")):
            add_edge(user, nid, "jobs", "data")

    # external services
    llms = tech_names("llm")
    llm_users = users_of(llms, ("llm_client", "service", "entry"))
    if llms:
        if detailed:
            for t in llms:
                nid = add_node(
                    f"ext_llm_{_slug(t['name'])}",
                    t["name"],
                    "llm",
                    "external",
                    "LLM API (" + t["evidence"][0] + ")",
                    [t["name"]],
                )
                for user in llm_users:
                    add_edge(user, nid, "prompts", "external")
        else:
            nid = add_node(
                "ext_llm",
                "LLM providers",
                "llm",
                "external",
                "Language model APIs: " + ", ".join(t["name"] for t in llms),
                [t["name"] for t in llms],
            )
            for user in llm_users:
                add_edge(user, nid, "prompts", "external")
    for t in tech_names("git")[:1]:
        nid = add_node(
            "ext_github",
            t["name"],
            "external",
            "external",
            "Remote repositories (" + t["evidence"][0] + ")",
            [t["name"]],
        )
        for user in users_of([t], ("service", "router")):
            add_edge(user, nid, "clone / fetch", "external")
    for category in ("cloud", "payments", "search"):
        for t in tech_names(category)[:2]:
            nid = add_node(f"ext_{_slug(t['name'])}", t["name"], "external", "external", t["evidence"][0], [t["name"]])
            for user in users_of([t], ("service", "entry")):
                add_edge(user, nid, "", "external")

    # client -> backend
    client_nodes = [nid for nid, n in nodes.items() if n["group"] == "client"]
    backend_nodes = [nid for nid, n in nodes.items() if n["group"] == "backend"]
    if client_nodes and backend_nodes:
        caller = next((nid for nid in client_nodes if nodes[nid]["kind"] == "api_client"), None)
        if caller is None:
            caller = next((nid for nid in client_nodes if nodes[nid]["kind"] in {"ui", "client"}), client_nodes[0])
        target = next((nid for nid in backend_nodes if nodes[nid]["kind"] == "security"), None) if detailed else None
        target = target or next((nid for nid in backend_nodes if nodes[nid]["kind"] == "router"), None)
        target = target or next((nid for nid in backend_nodes if nodes[nid]["kind"] == "entry"), backend_nodes[0])
        comp_flags = {f for c in comps.values() for f in c.get("flags", [])}
        label = "REST / SSE" if "sse" in comp_flags else "REST / HTTP"
        if "websocket" in {
            f for nid in client_nodes for f in comps.get(nodes[nid].get("_comp", ""), {}).get("flags", [])
        }:
            label += " / WS"
        add_edge(caller, target, label, "network")
        shell = next((nid for nid in client_nodes if nodes[nid]["kind"] == "shell"), None)
        ui_entry = next(
            (nid for nid in client_nodes if nodes[nid]["kind"] == "entry"),
            next((nid for nid in client_nodes if nodes[nid]["kind"] in {"ui", "client"} and nid != shell), None),
        )
        if shell and ui_entry:
            add_edge(shell, ui_entry, "hosts", "network")

    # drop isolated backend/client nodes in overview (keeps the picture tidy)
    if not detailed:
        connected = {e["source"] for e in edges.values()} | {e["target"] for e in edges.values()}
        for nid in list(nodes):
            if nid not in connected and nodes[nid]["group"] in {"backend", "client"} and len(nodes) > 6:
                del nodes[nid]

    flows = _derive_flows(nodes, list(edges.values()))
    frameworks = [t["name"] for t in techs if t["category"] in {"web_framework", "ui_framework", "desktop"}]
    summary = (
        f"{facts.get('root_name', 'This project')} is built with {', '.join(dict.fromkeys(frameworks)) or 'its own code'}. "
        f"The diagram shows {sum(1 for n in nodes.values() if n['group'] in {'client', 'backend'})} code components "
        f"grouped into layers, plus the data stores and external services they talk to."
    )

    used_groups = {n["group"] for n in nodes.values()}
    return {
        "title": f"{facts.get('root_name', 'Repository')} — system design",
        "summary": summary,
        "groups": [g for g in GROUPS if g["id"] in used_groups],
        "nodes": [_public(n) for n in nodes.values()],
        "edges": [_public(e) for e in edges.values()],
        "flows": flows,
    }


def _public(item: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in item.items() if not k.startswith("_")}


def _derive_flows(nodes: dict[str, dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find a few start-to-sink paths (client -> data / external) to describe request flows."""
    adj: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        adj[e["source"]].append(e["target"])
    starts = [nid for nid, n in nodes.items() if n["group"] == "client" and n["kind"] in {"ui", "client", "entry"}]
    if not starts:
        starts = [nid for nid, n in nodes.items() if n["kind"] in {"entry", "router"}]
    sinks = [nid for nid, n in nodes.items() if n["group"] in {"data", "external"}]
    flows: list[dict[str, Any]] = []
    for sink in sinks:
        best: list[str] | None = None
        for start in starts:
            path = _bfs(adj, start, sink)
            if path and (best is None or len(path) < len(best)):
                best = path
        if best and len(best) >= 3:
            flows.append({"name": f"Request to {nodes[sink]['label']}", "steps": best})
        if len(flows) >= 4:
            break
    return flows


def _bfs(adj: dict[str, list[str]], start: str, goal: str) -> list[str] | None:
    queue: deque[list[str]] = deque([[start]])
    seen = {start}
    while queue:
        path = queue.popleft()
        if path[-1] == goal:
            return path
        if len(path) > 7:
            continue
        for nxt in adj.get(path[-1], []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append([*path, nxt])
    return None
