"""Collect grounded, deterministic facts about a repository for system design diagrams.

Everything here is read-only and bounded:

* the walk never follows symlinks and never leaves the repository root,
* ``.env`` files are never opened (only the *key names* of ``.env.example`` style files are read),
* the number of files and the number of bytes read are capped.

The output is a plain ``dict`` (JSON serialisable) so it can be cached, hashed and
sent to an LLM as context.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ── Limits ────────────────────────────────────────────────────────────────

MAX_FILES = 4000
MAX_FILE_BYTES = 200_000
MAX_TOTAL_BYTES = 12_000_000
MAX_COMPONENTS_PER_TOP = 14
README_CHARS = 1200

SKIP_DIRS: set[str] = {
    ".git",
    "__pycache__",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
    ".idea",
    ".vscode",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    "dist",
    "build",
    "out",
    "coverage",
    "htmlcov",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "target",
    "vendor",
    "bin",
    "obj",
    ".cache",
    "data",
    "tmp",
    ".turbo",
}

TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs", "e2e", "testing"}
NON_SYSTEM_DIRS = {"docs", "doc", "examples", "example", "scripts", "assets", "public", "static", "fixtures"}
WRAPPER_DIRS = {"src", "app", "lib", "source", "pkg", "internal"}

SOURCE_EXTS: dict[str, str] = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".rs": "Rust",
}
UI_EXTS = {".tsx", ".jsx", ".vue", ".svelte"}
JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]

ENV_TEMPLATE_NAMES = {".env.example", ".env.sample", ".env.template", ".env.dist", "env.example"}

# ── Known technologies ────────────────────────────────────────────────────
# key -> (display name, category)

TECH: dict[str, tuple[str, str]] = {
    # python web / server
    "fastapi": ("FastAPI", "web_framework"),
    "flask": ("Flask", "web_framework"),
    "django": ("Django", "web_framework"),
    "starlette": ("Starlette", "web_framework"),
    "uvicorn": ("Uvicorn", "server"),
    "gunicorn": ("Gunicorn", "server"),
    # data
    "sqlalchemy": ("SQLAlchemy", "orm"),
    "alembic": ("Alembic", "migrations"),
    "asyncpg": ("PostgreSQL", "sql_db"),
    "psycopg": ("PostgreSQL", "sql_db"),
    "psycopg2": ("PostgreSQL", "sql_db"),
    "aiosqlite": ("SQLite", "sql_db"),
    "sqlite3": ("SQLite", "sql_db"),
    "pymysql": ("MySQL", "sql_db"),
    "pymongo": ("MongoDB", "nosql_db"),
    "motor": ("MongoDB", "nosql_db"),
    "redis": ("Redis", "cache"),
    "celery": ("Celery", "queue"),
    "faiss": ("FAISS", "vector_store"),
    "chromadb": ("Chroma", "vector_store"),
    "qdrant_client": ("Qdrant", "vector_store"),
    "pinecone": ("Pinecone", "vector_store"),
    "boto3": ("AWS (boto3)", "cloud"),
    # ai
    "sentence_transformers": ("Sentence-Transformers", "embeddings"),
    "transformers": ("HF Transformers", "embeddings"),
    "groq": ("Groq", "llm"),
    "openai": ("OpenAI", "llm"),
    "anthropic": ("Anthropic", "llm"),
    "ollama": ("Ollama", "llm"),
    "langchain": ("LangChain", "llm_framework"),
    "llama_index": ("LlamaIndex", "llm_framework"),
    # misc python
    "networkx": ("NetworkX", "graph_lib"),
    "tree_sitter": ("tree-sitter", "parser"),
    "jose": ("python-jose (JWT)", "auth"),
    "jwt": ("PyJWT", "auth"),
    "passlib": ("passlib", "auth"),
    "bcrypt": ("bcrypt", "auth"),
    "slowapi": ("SlowAPI rate limiting", "rate_limit"),
    "httpx": ("httpx", "http_client"),
    "requests": ("requests", "http_client"),
    "aiohttp": ("aiohttp", "http_client"),
    "git": ("GitPython", "git"),
    "pydantic": ("Pydantic", "validation"),
    # js
    "react": ("React", "ui_framework"),
    "next": ("Next.js", "ui_framework"),
    "vue": ("Vue", "ui_framework"),
    "svelte": ("Svelte", "ui_framework"),
    "@angular/core": ("Angular", "ui_framework"),
    "vite": ("Vite", "build_tool"),
    "electron": ("Electron", "desktop"),
    "express": ("Express", "web_framework"),
    "fastify": ("Fastify", "web_framework"),
    "@nestjs/core": ("NestJS", "web_framework"),
    "zustand": ("Zustand", "state"),
    "redux": ("Redux", "state"),
    "@reduxjs/toolkit": ("Redux Toolkit", "state"),
    "@tanstack/react-query": ("TanStack Query", "state"),
    "axios": ("axios", "http_client"),
    "@xyflow/react": ("React Flow", "visualisation"),
    "cytoscape": ("Cytoscape", "visualisation"),
    "d3": ("D3", "visualisation"),
    "tailwindcss": ("Tailwind CSS", "styling"),
    "prisma": ("Prisma", "orm"),
    "@prisma/client": ("Prisma", "orm"),
    "mongoose": ("MongoDB", "nosql_db"),
    "pg": ("PostgreSQL", "sql_db"),
    "mysql2": ("MySQL", "sql_db"),
    "socket.io": ("Socket.IO", "realtime"),
    "firebase": ("Firebase", "cloud"),
    "@supabase/supabase-js": ("Supabase", "cloud"),
    "stripe": ("Stripe", "payments"),
}

ENV_HINTS: dict[str, tuple[str, str]] = {
    "GROQ_API_KEY": ("Groq", "llm"),
    "OPENAI_API_KEY": ("OpenAI", "llm"),
    "OPENROUTER_API_KEY": ("OpenRouter", "llm"),
    "ANTHROPIC_API_KEY": ("Anthropic", "llm"),
    "OLLAMA": ("Ollama", "llm"),
    "REDIS_URL": ("Redis", "cache"),
    "GITHUB_TOKEN": ("GitHub", "git"),
    "AWS_ACCESS_KEY_ID": ("AWS", "cloud"),
    "STRIPE": ("Stripe", "payments"),
}

COMPOSE_IMAGE_HINTS: dict[str, tuple[str, str]] = {
    "postgres": ("PostgreSQL", "sql_db"),
    "mysql": ("MySQL", "sql_db"),
    "mariadb": ("MySQL", "sql_db"),
    "mongo": ("MongoDB", "nosql_db"),
    "redis": ("Redis", "cache"),
    "nginx": ("Nginx", "proxy"),
    "ollama": ("Ollama", "llm"),
    "rabbitmq": ("RabbitMQ", "queue"),
    "elasticsearch": ("Elasticsearch", "search"),
}

ENTRY_NAMES = {
    "main.py",
    "app.py",
    "manage.py",
    "wsgi.py",
    "asgi.py",
    "server.py",
    "main.ts",
    "main.tsx",
    "index.ts",
    "index.tsx",
    "index.js",
    "server.js",
    "server.ts",
    "app.js",
    "app.ts",
    "main.go",
}

_PY_IMPORT = re.compile(r"^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))", re.MULTILINE)
_JS_IMPORT = re.compile(
    r"""(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]"""
)
_FASTAPI_PREFIX = re.compile(r"APIRouter\([^)]*prefix\s*=\s*['\"]([^'\"]+)['\"]")
_ROUTE_DECORATOR = re.compile(r"@\w+\.(get|post|put|patch|delete|websocket)\(\s*['\"]([^'\"]*)['\"]")
_EXPRESS_ROUTE = re.compile(r"\b(?:app|router)\.(get|post|put|patch|delete)\(\s*['\"`]([^'\"`]+)['\"`]")
_UI_ROUTE = re.compile(r"""<Route[^>]*\bpath\s*=\s*['"]([^'"]+)['"]""")
_SSE_HINT = re.compile(r"text/event-stream|EventSource|StreamingResponse|EventSourceResponse")
_WS_HINT = re.compile(r"WebSocket|socket\.io|websocket")


@dataclass
class _FileInfo:
    rel: str
    ext: str
    size: int
    component: str = ""


@dataclass
class _Ctx:
    root: Path
    files: list[_FileInfo] = field(default_factory=list)
    bytes_read: int = 0
    truncated: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────


def _is_within(root: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(root)
        return True
    except (ValueError, OSError):
        return False


def _read_text(ctx: _Ctx, rel: str, limit: int = MAX_FILE_BYTES) -> str:
    """Read a file under the root with size and total-budget limits. Never reads ``.env``."""
    name = os.path.basename(rel).lower()
    if name.startswith(".env") and name not in ENV_TEMPLATE_NAMES:
        return ""
    if ctx.bytes_read >= MAX_TOTAL_BYTES:
        ctx.truncated = True
        return ""
    path = ctx.root / rel
    if path.is_symlink() or not _is_within(ctx.root, path):
        return ""
    try:
        with open(path, "rb") as fh:
            raw = fh.read(limit)
    except OSError:
        return ""
    ctx.bytes_read += len(raw)
    return raw.decode("utf-8", errors="replace")


def _walk(ctx: _Ctx) -> None:
    root = ctx.root
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(
            d
            for d in dirnames
            if not d.startswith(".")
            and d not in SKIP_DIRS
            and not d.endswith(".egg-info")
            and not os.path.islink(os.path.join(dirpath, d))
        )
        for fname in sorted(filenames):
            full = os.path.join(dirpath, fname)
            if os.path.islink(full):
                continue
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            ext = os.path.splitext(fname)[1].lower()
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            ctx.files.append(_FileInfo(rel=rel, ext=ext, size=size))
            if len(ctx.files) >= MAX_FILES:
                ctx.truncated = True
                return


def _source_files(ctx: _Ctx) -> list[_FileInfo]:
    return [f for f in ctx.files if f.ext in SOURCE_EXTS]


def _is_test_path(rel: str) -> bool:
    parts = rel.lower().split("/")
    if any(p in TEST_DIR_NAMES for p in parts[:-1]):
        return True
    name = parts[-1]
    return name.startswith("test_") or ".test." in name or ".spec." in name or name.endswith("_test.py")


# ── Component discovery ───────────────────────────────────────────────────


def _discover_components(ctx: _Ctx) -> dict[str, dict[str, Any]]:
    """Group source files into components (folders that act as system building blocks)."""
    src = [f for f in _source_files(ctx) if not _is_test_path(f.rel)]
    by_top: dict[str, list[_FileInfo]] = defaultdict(list)
    for f in src:
        parts = f.rel.split("/")
        top = parts[0] if len(parts) > 1 else "."
        if top.lower() in NON_SYSTEM_DIRS:
            continue
        by_top[top].append(f)

    components: dict[str, dict[str, Any]] = {}

    def add(comp_id: str, label_path: str, files: list[_FileInfo]) -> None:
        for f in files:
            f.component = comp_id
        langs = Counter(SOURCE_EXTS[f.ext] for f in files)
        components[comp_id] = {
            "id": comp_id,
            "path": label_path,
            "file_count": len(files),
            "languages": dict(langs.most_common()),
            "ui_ratio": round(sum(1 for f in files if f.ext in UI_EXTS) / max(1, len(files)), 2),
            "sample_files": [f.rel for f in sorted(files, key=lambda x: -x.size)[:6]],
        }

    for top, files in sorted(by_top.items()):
        if top == ".":
            add("root", ".", files)
            continue
        base = top
        base_files = files
        # descend through wrapper directories like src/ or app/
        while True:
            sub: dict[str, list[_FileInfo]] = defaultdict(list)
            direct: list[_FileInfo] = []
            depth = base.count("/") + 1
            for f in base_files:
                parts = f.rel.split("/")
                if len(parts) > depth + 1:
                    sub[parts[depth]].append(f)
                else:
                    direct.append(f)
            wrapper = [name for name in sub if name.lower() in WRAPPER_DIRS]
            share = len(sub[wrapper[0]]) / max(1, len(base_files)) if len(wrapper) == 1 else 0.0
            if len(wrapper) == 1 and (share >= 0.75 or (len(direct) <= 2 and share >= 0.6)):
                base = f"{base}/{wrapper[0]}"
                base_files = sub[wrapper[0]]
                continue
            break

        big_subs = {name: fs for name, fs in sub.items() if len(fs) >= 2}
        if len(base_files) >= 8 and len(big_subs) >= 2:
            ranked = sorted(big_subs.items(), key=lambda kv: -len(kv[1]))
            keep = ranked[:MAX_COMPONENTS_PER_TOP]
            rest: list[_FileInfo] = [f for _, fs in ranked[MAX_COMPONENTS_PER_TOP:] for f in fs]
            rest += [f for name, fs in sub.items() if name not in big_subs for f in fs]
            for name, fs in keep:
                add(f"{base}/{name}", f"{base}/{name}", fs)
            if direct:
                add(f"{base}/(entry)", base, direct)
            if rest:
                add(f"{base}/(other)", base, rest)
        else:
            add(base, base, base_files)

    return components


# ── Import graph ─────────────────────────────────────────────────────────


def _build_module_index(ctx: _Ctx) -> tuple[dict[str, str], dict[str, str]]:
    """Return (python module name -> rel file, rel file without ext -> rel file)."""
    py_index: dict[str, str] = {}
    js_index: dict[str, str] = {}
    for f in _source_files(ctx):
        stem = f.rel.rsplit(".", 1)[0]
        if f.ext == ".py":
            mod = stem.replace("/", ".")
            if mod.endswith(".__init__"):
                mod = mod[: -len(".__init__")]
            py_index[mod] = f.rel
            # allow imports relative to wrapper dirs (e.g. src/pkg -> pkg)
            parts = mod.split(".")
            if parts and parts[0] in WRAPPER_DIRS and len(parts) > 1:
                py_index.setdefault(".".join(parts[1:]), f.rel)
        else:
            js_index[stem] = f.rel
            if stem.endswith("/index"):
                js_index.setdefault(stem[: -len("/index")], f.rel)
    return py_index, js_index


def _resolve_py(module: str, current_rel: str, py_index: dict[str, str]) -> str | None:
    if module.startswith("."):
        level = len(module) - len(module.lstrip("."))
        pkg_parts = current_rel.rsplit(".", 1)[0].split("/")[:-1]
        if level > 1:
            pkg_parts = pkg_parts[: -(level - 1)] if level - 1 <= len(pkg_parts) else []
        rest = module.lstrip(".")
        module = ".".join([*pkg_parts, *([rest] if rest else [])])
    parts = module.split(".")
    while parts:
        hit = py_index.get(".".join(parts))
        if hit:
            return hit
        parts = parts[:-1]
    return None


def _resolve_js(spec: str, current_rel: str, js_index: dict[str, str], src_roots: list[str]) -> str | None:
    if spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(current_rel), spec)).replace(os.sep, "/")
        stem = base.rsplit(".", 1)[0] if os.path.splitext(base)[1] in JS_EXTS else base
        return js_index.get(stem)
    if spec.startswith("@/") or spec.startswith("~/"):
        for root in src_roots:
            cand = f"{root}/{spec[2:]}"
            stem = cand.rsplit(".", 1)[0] if os.path.splitext(cand)[1] in JS_EXTS else cand
            if stem in js_index:
                return js_index[stem]
        return None
    return None


_PY_STDLIB = set(getattr(sys, "stdlib_module_names", ())) | {"__future__"}
_NODE_BUILTINS = {
    "assert",
    "buffer",
    "child_process",
    "cluster",
    "crypto",
    "dns",
    "events",
    "fs",
    "http",
    "https",
    "net",
    "os",
    "path",
    "process",
    "querystring",
    "readline",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "url",
    "util",
    "v8",
    "vm",
    "worker_threads",
    "zlib",
}


def _external_package(spec: str, is_python: bool) -> str | None:
    """Return the third-party package name for an import spec, or None for local/stdlib imports."""
    if is_python:
        if spec.startswith("."):
            return None
        name = spec.split(".")[0]
        return None if name in _PY_STDLIB else name
    if spec.startswith(".") or spec.startswith("/") or spec.startswith("@/") or spec.startswith("~/"):
        return None
    if spec.startswith("node:"):
        return None
    parts = spec.split("/")
    name = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
    return None if name in _NODE_BUILTINS else name


# ── Manifests ────────────────────────────────────────────────────────────


def _parse_requirements(text: str) -> list[str]:
    deps = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name = re.split(r"[\s<>=!~;\[]", line, maxsplit=1)[0].strip().lower()
        if name:
            deps.append(name)
    return deps


def _parse_pyproject(text: str) -> list[str]:
    deps: list[str] = []
    in_deps = False
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^(dependencies|requires)\s*=\s*\[", stripped):
            in_deps = True
        if in_deps:
            for m in re.finditer(r"['\"]([A-Za-z0-9_.\-]+)", stripped):
                deps.append(m.group(1).lower())
            if "]" in stripped:
                in_deps = False
        dep_match = re.match(r"^([A-Za-z0-9_.\-]+)\s*=\s*[\"{]", stripped)
        if dep_match and dep_match.group(1).lower() not in {"name", "version", "description", "python", "readme", "license"}:
            deps.append(dep_match.group(1).lower())
    return deps


def _normalise_dep(name: str) -> str:
    aliases = {
        "python-jose": "jose",
        "pyjwt": "jwt",
        "faiss-cpu": "faiss",
        "faiss-gpu": "faiss",
        "sentence-transformers": "sentence_transformers",
        "psycopg2-binary": "psycopg2",
        "psycopg-binary": "psycopg",
        "gitpython": "git",
        "tree-sitter": "tree_sitter",
        "qdrant-client": "qdrant_client",
        "llama-index": "llama_index",
        "uvicorn[standard]": "uvicorn",
    }
    name = name.lower()
    return aliases.get(name, name.replace("-", "_") if name.replace("-", "_") in TECH else name)


# ── Public API ───────────────────────────────────────────────────────────


def collect_repo_facts(repo_path: str | Path) -> dict[str, Any]:
    """Collect deterministic facts about a repository. Safe to call on untrusted repos."""
    root = Path(repo_path).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Repository path does not exist: {root}")

    ctx = _Ctx(root=root)
    _walk(ctx)
    components = _discover_components(ctx)
    py_index, js_index = _build_module_index(ctx)
    src_roots = sorted({c["path"] for c in components.values() if c["path"].endswith("/src")} | {"src"})

    comp_edges: Counter[tuple[str, str]] = Counter()
    comp_packages: dict[str, Counter[str]] = defaultdict(Counter)
    routes: list[dict[str, str]] = []
    ui_routes: list[str] = []
    comp_flags: dict[str, set[str]] = defaultdict(set)
    entry_points: list[str] = []
    file_component = {f.rel: f.component for f in ctx.files if f.component}

    for f in _source_files(ctx):
        if _is_test_path(f.rel) or not f.component:
            continue
        if os.path.basename(f.rel) in ENTRY_NAMES and f.rel.count("/") <= 3:
            entry_points.append(f.rel)
        text = _read_text(ctx, f.rel)
        if not text:
            continue
        is_py = f.ext == ".py"
        specs: list[str] = []
        if is_py:
            for m in _PY_IMPORT.finditer(text):
                if m.group(1):
                    specs.append(m.group(1))
                elif m.group(2):
                    specs.extend(s.strip() for s in m.group(2).split(","))
        elif f.ext in JS_EXTS:
            specs = [m.group(1) for m in _JS_IMPORT.finditer(text)]

        for spec in specs:
            target = _resolve_py(spec, f.rel, py_index) if is_py else _resolve_js(spec, f.rel, js_index, src_roots)
            if target:
                tc = file_component.get(target)
                if tc and tc != f.component:
                    comp_edges[(f.component, tc)] += 1
                continue
            pkg = _external_package(spec, is_py)
            if pkg:
                comp_packages[f.component][_normalise_dep(pkg)] += 1

        for m in _FASTAPI_PREFIX.finditer(text):
            routes.append({"prefix": m.group(1), "file": f.rel, "component": f.component})
        if is_py and not _FASTAPI_PREFIX.search(text):
            for m in list(_ROUTE_DECORATOR.finditer(text))[:3]:
                routes.append({"prefix": m.group(2) or "/", "file": f.rel, "component": f.component})
        if f.ext in JS_EXTS:
            for m in list(_EXPRESS_ROUTE.finditer(text))[:5]:
                routes.append({"prefix": m.group(2), "file": f.rel, "component": f.component})
            for m in _UI_ROUTE.finditer(text):
                if len(ui_routes) < 60:
                    ui_routes.append(m.group(1))
        if _SSE_HINT.search(text):
            comp_flags[f.component].add("sse")
        if _WS_HINT.search(text):
            comp_flags[f.component].add("websocket")
        if "api.github.com" in text or "github.com/" in text and "clone" in text:
            comp_flags[f.component].add("github")
        if "fetch(" in text or "axios" in text:
            comp_flags[f.component].add("http_client")

    # manifests
    declared: set[str] = set()
    manifests: list[str] = []
    compose_services: list[dict[str, str]] = []
    env_keys: list[str] = []
    readme = ""
    for f in ctx.files:
        name = os.path.basename(f.rel).lower()
        depth = f.rel.count("/")
        if depth > 2:
            continue
        if name.startswith("requirements") and name.endswith(".txt"):
            declared.update(_normalise_dep(d) for d in _parse_requirements(_read_text(ctx, f.rel)))
            manifests.append(f.rel)
        elif name == "pyproject.toml":
            declared.update(_normalise_dep(d) for d in _parse_pyproject(_read_text(ctx, f.rel)))
            manifests.append(f.rel)
        elif name == "package.json":
            try:
                pkg_data = json.loads(_read_text(ctx, f.rel) or "{}")
            except json.JSONDecodeError:
                pkg_data = {}
            if isinstance(pkg_data, dict):
                for section in ("dependencies", "devDependencies"):
                    deps = pkg_data.get(section) or {}
                    if isinstance(deps, dict):
                        declared.update(str(k).lower() for k in deps)
            manifests.append(f.rel)
        elif name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
            manifests.append(f.rel)
            text = _read_text(ctx, f.rel)
            current = None
            in_services = False
            for line in text.splitlines():
                if re.match(r"^services:\s*$", line):
                    in_services = True
                    continue
                if in_services and re.match(r"^\S", line):
                    in_services = False
                svc_m = re.match(r"^  ([A-Za-z0-9_.\-]+):\s*$", line)
                if in_services and svc_m:
                    current = {"name": svc_m.group(1), "image": ""}
                    compose_services.append(current)
                img_m = re.match(r"^\s+image:\s*['\"]?([^'\"\s]+)", line)
                if in_services and img_m and current is not None:
                    current["image"] = img_m.group(1)
        elif name == "dockerfile":
            manifests.append(f.rel)
        elif name in ENV_TEMPLATE_NAMES:
            for line in _read_text(ctx, f.rel).splitlines():
                env_m = re.match(r"^\s*([A-Z][A-Z0-9_]{2,})\s*=", line)
                if env_m and len(env_keys) < 80:
                    env_keys.append(env_m.group(1))
        elif name in {"readme.md", "readme.rst", "readme.txt", "readme"} and depth == 0 and not readme:
            readme = _read_text(ctx, f.rel, limit=README_CHARS * 4)[:README_CHARS]

    # technologies
    tech: dict[str, dict[str, Any]] = {}

    def add_tech(display: str, category: str, evidence: str, used_by: str | None = None) -> None:
        entry = tech.setdefault(display, {"name": display, "category": category, "evidence": [], "used_by": []})
        if evidence not in entry["evidence"] and len(entry["evidence"]) < 4:
            entry["evidence"].append(evidence)
        if used_by and used_by not in entry["used_by"]:
            entry["used_by"].append(used_by)

    for dep in sorted(declared):
        if dep in TECH:
            add_tech(*TECH[dep], evidence=f"declared dependency '{dep}'")
    for comp, pkgs in comp_packages.items():
        for pkg in pkgs:
            if pkg in TECH:
                add_tech(*TECH[pkg], evidence=f"imported in {comp}", used_by=comp)
    for key in env_keys:
        for hint, (display, category) in ENV_HINTS.items():
            if hint in key:
                add_tech(display, category, evidence=f"env var {key}")
    for svc in compose_services:
        for hint, (display, category) in COMPOSE_IMAGE_HINTS.items():
            if hint in (svc.get("image") or svc["name"]).lower():
                add_tech(display, category, evidence=f"docker-compose service '{svc['name']}'")
    for comp, flags in comp_flags.items():
        if "github" in flags:
            add_tech("GitHub", "git", evidence=f"GitHub access in {comp}", used_by=comp)

    for comp_id, comp_info in components.items():
        comp_info["flags"] = sorted(comp_flags.get(comp_id, set()))
        comp_info["packages"] = [p for p, _ in comp_packages.get(comp_id, Counter()).most_common(12)]

    lang_totals = Counter(SOURCE_EXTS[f.ext] for f in _source_files(ctx))
    edges = [
        {"source": s, "target": t, "weight": w}
        for (s, t), w in sorted(comp_edges.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    return {
        "root_name": root.name,
        "stats": {
            "files_seen": len(ctx.files),
            "source_files": sum(1 for f in ctx.files if f.ext in SOURCE_EXTS),
            "languages": dict(lang_totals.most_common()),
            "truncated": ctx.truncated,
        },
        "components": components,
        "component_edges": edges,
        "technologies": sorted(tech.values(), key=lambda t: (t["category"], t["name"])),
        "routes": routes[:80],
        "ui_routes": sorted(set(ui_routes))[:40],
        "entry_points": sorted(set(entry_points))[:12],
        "manifests": sorted(set(manifests)),
        "compose_services": compose_services[:20],
        "env_keys": sorted(set(env_keys)),
        "readme_excerpt": readme,
    }
