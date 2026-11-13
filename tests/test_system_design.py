"""Tests for the system design diagram feature (facts, builder, sanitiser, Groq enrichment, API)."""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.llm.exceptions import ProviderHTTPError
from backend.services.system_design import service as sd_service
from backend.services.system_design.builder import build_diagram
from backend.services.system_design.enricher import SYSTEM_PROMPT, build_prompt, parse_json_reply
from backend.services.system_design.facts import collect_repo_facts
from backend.services.system_design.mermaid import to_mermaid
from backend.services.system_design.schema import MAX_NODES, sanitize_diagram
from backend.services.system_design.service import SystemDesignService, default_llm_factory

# fixtures


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    root = tmp_path / "shop"
    _write(root, "backend/main.py", "from fastapi import FastAPI\nfrom backend.api import orders\napp = FastAPI()\n")
    _write(root, "backend/api/__init__.py", "")
    _write(
        root,
        "backend/api/orders.py",
        "from fastapi import APIRouter\nfrom backend.db.models import Order\nfrom backend.llm.client import ask\n"
        "router = APIRouter(prefix='/api/orders')\n",
    )
    _write(root, "backend/api/users.py", "from fastapi import APIRouter\nfrom backend.security.auth import check\n")
    _write(root, "backend/db/__init__.py", "")
    _write(root, "backend/db/models.py", "import sqlalchemy\nclass Order: ...\n")
    _write(root, "backend/db/session.py", "from sqlalchemy.ext.asyncio import create_async_engine\n")
    _write(root, "backend/llm/__init__.py", "")
    _write(root, "backend/llm/client.py", "import httpx\nasync def ask(q): ...\n")
    _write(root, "backend/llm/prompts.py", "PROMPT = 'x'\n")
    _write(root, "backend/security/__init__.py", "")
    _write(root, "backend/security/auth.py", "import jwt\ndef check(): ...\n")
    _write(root, "backend/security/limits.py", "import slowapi\n")
    _write(root, "requirements.txt", "fastapi==0.115\nsqlalchemy\naiosqlite\ngroq\npyjwt\n")
    _write(
        root,
        "frontend/package.json",
        json.dumps({"dependencies": {"react": "19", "zustand": "5"}, "devDependencies": {"vite": "7"}}),
    )
    _write(root, "frontend/src/main.tsx", "import App from './App';\n")
    _write(root, "frontend/src/App.tsx", "import Home from './pages/Home';\n<Route path=\"/home\" />\n")
    _write(
        root,
        "frontend/src/pages/Home.tsx",
        "import { api } from '../services/api';\nimport { useStore } from '../stores/s';\n",
    )
    _write(root, "frontend/src/pages/Cart.tsx", "import { api } from '../services/api';\n")
    _write(root, "frontend/src/services/api.ts", "export const api = () => fetch('/api/orders');\n")
    _write(root, "frontend/src/services/sse.ts", "new EventSource('/api/stream');\n")
    _write(root, "frontend/src/stores/s.ts", "import { create } from 'zustand';\n")
    _write(root, "frontend/src/stores/t.ts", "import { create } from 'zustand';\n")
    _write(root, "tests/test_x.py", "def test(): pass\n")
    _write(root, ".env", "GROQ_API_KEY=super-secret-value-123\n")
    _write(root, ".env.example", "GROQ_API_KEY=\nDATABASE_URL=\n")
    return root


class FakeLLM:
    def __init__(self, reply: str | Exception | list[str | Exception]) -> None:
        self.reply = reply
        self.calls = 0
        self.last_prompt = ""
        self.extra_bodies: list[dict | None] = []

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.7,
        *,
        extra_body: dict | None = None,
        model: str | None = None,
    ) -> str:
        self.calls += 1
        self.last_prompt = prompt
        self.extra_bodies.append(extra_body)
        if isinstance(self.reply, list):
            item = self.reply[min(self.calls - 1, len(self.reply) - 1)]
            if isinstance(item, Exception):
                raise item
            return item
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


GOOD_REPLY = json.dumps(
    {
        "title": "Shop system design",
        "summary": "A React client talks to a FastAPI backend.",
        "groups": [{"id": "client", "label": "Client"}, {"id": "hacker", "label": "bad"}],
        "nodes": [
            {"id": "frontend_src_pages", "label": "Pages", "kind": "ui", "group": "client", "description": "Screens"},
            {"id": "frontend_src_services", "label": "API client", "kind": "api_client", "group": "client"},
            {"id": "backend_api", "label": "API routers", "kind": "router", "group": "backend"},
            {"id": "store_sql", "label": "SQLite DB", "kind": "database", "group": "data"},
            {"id": "evil", "label": "<script>alert(1)</script>", "kind": "rootkit", "group": "space"},
        ],
        "edges": [
            {"source": "frontend_src_pages", "target": "frontend_src_services"},
            {"source": "frontend_src_services", "target": "backend_api", "label": "REST / SSE"},
            {"source": "backend_api", "target": "store_sql", "label": "SQL"},
            {"source": "backend_api", "target": "does_not_exist"},
        ],
        "flows": [{"name": "Place order", "steps": ["frontend_src_pages", "backend_api", "store_sql", "ghost"]}],
    }
)


# facts


def test_facts_find_components_edges_and_tech(sample_repo: Path) -> None:
    facts = collect_repo_facts(sample_repo)
    comps = set(facts["components"])
    assert {"backend/api", "backend/db", "backend/llm", "backend/security"} <= comps
    assert "frontend/src/pages" in comps and "frontend/src/services" in comps
    assert not any(c.startswith("tests") for c in comps), "test folders must not become components"
    edges = {(e["source"], e["target"]) for e in facts["component_edges"]}
    assert ("backend/api", "backend/db") in edges
    assert ("frontend/src/pages", "frontend/src/services") in edges
    tech = {t["name"] for t in facts["technologies"]}
    assert {"FastAPI", "SQLAlchemy", "SQLite", "Groq", "React", "Zustand", "Vite"} <= tech
    assert any(r["prefix"] == "/api/orders" for r in facts["routes"])
    assert "/home" in facts["ui_routes"]


def test_facts_never_read_env_secrets(sample_repo: Path) -> None:
    facts = collect_repo_facts(sample_repo)
    blob = json.dumps(facts)
    assert "super-secret-value-123" not in blob
    assert "GROQ_API_KEY" in facts["env_keys"]  # key *names* from .env.example are fine


@pytest.mark.skipif(os.name == "nt", reason="symlinks need privileges on Windows")
def test_facts_do_not_follow_symlinks_outside_repo(sample_repo: Path, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    _write(outside, "secret.py", "TOKEN = 'outside-secret'\nimport groq\n")
    (sample_repo / "linked").symlink_to(outside, target_is_directory=True)
    facts = collect_repo_facts(sample_repo)
    assert "outside-secret" not in json.dumps(facts)
    assert not any(c.startswith("linked") for c in facts["components"])


def test_facts_missing_path_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        collect_repo_facts(tmp_path / "nope")


# builder / sanitiser / mermaid


@pytest.mark.parametrize("detail", ["overview", "detailed"])
def test_build_diagram_is_layered_and_consistent(sample_repo: Path, detail: str) -> None:
    diagram = sanitize_diagram(build_diagram(collect_repo_facts(sample_repo), detail))
    ids = {n["id"] for n in diagram["nodes"]}
    groups = {g["id"] for g in diagram["groups"]}
    assert {"client", "backend", "data", "external"} <= groups
    assert all(e["source"] in ids and e["target"] in ids for e in diagram["edges"])
    network = [e for e in diagram["edges"] if e["label"].startswith("REST")]
    assert network, "client must be connected to the backend"
    assert "SSE" in network[0]["label"]
    assert any(n["kind"] == "database" for n in diagram["nodes"])
    assert any(n["kind"] == "llm" for n in diagram["nodes"])


def test_sanitize_drops_unsafe_and_dangling_parts() -> None:
    raw = json.loads(GOOD_REPLY)
    raw["nodes"].append({"id": "x\x00y", "label": "ok\x07label", "group": "client"})
    clean = sanitize_diagram(raw)
    ids = {n["id"] for n in clean["nodes"]}
    evil = next(n for n in clean["nodes"] if n["id"] == "evil")
    assert evil["kind"] == "module" and evil["group"] == "backend"
    assert all(e["target"] != "does_not_exist" for e in clean["edges"])
    assert clean["flows"][0]["steps"] == ["frontend_src_pages", "backend_api", "store_sql"]
    assert "hacker" not in {g["id"] for g in clean["groups"]}
    assert "x_y" in ids and all("\x07" not in n["label"] for n in clean["nodes"])


def test_sanitize_infers_edge_kinds() -> None:
    clean = sanitize_diagram(json.loads(GOOD_REPLY))
    kinds = {(e["source"], e["target"]): e["kind"] for e in clean["edges"]}
    assert kinds[("frontend_src_services", "backend_api")] == "network"
    assert kinds[("backend_api", "store_sql")] == "data"
    assert kinds[("frontend_src_pages", "frontend_src_services")] == "dependency"


def test_sanitize_caps_node_count() -> None:
    raw = {"title": "t", "nodes": [{"id": f"n{i}", "label": f"N{i}"} for i in range(200)], "edges": []}
    assert len(sanitize_diagram(raw)["nodes"]) == MAX_NODES


def test_mermaid_export_is_valid_looking(sample_repo: Path) -> None:
    diagram = sanitize_diagram(build_diagram(collect_repo_facts(sample_repo), "overview"))
    text = to_mermaid(diagram)
    assert text.startswith("flowchart TB")
    assert 'subgraph client["Client"]' in text
    assert "-->" in text


# enricher


def test_parse_json_reply_handles_fences_and_chatter() -> None:
    assert parse_json_reply('Sure!\n```json\n{"a": 1}\n```\nbye')["a"] == 1
    assert parse_json_reply('<think>hmm {"no": 1}</think> {"b": 2}')["b"] == 2
    with pytest.raises(ValueError):
        parse_json_reply("no json here")


def test_prompt_contains_facts_but_not_secrets(sample_repo: Path) -> None:
    facts = collect_repo_facts(sample_repo)
    prompt = build_prompt(facts, build_diagram(facts, "overview"))
    assert "backend/api" in prompt and "FastAPI" in prompt
    assert "super-secret-value-123" not in prompt
    assert len(prompt) < 30_000


# service


async def test_service_uses_llm_and_caches(sample_repo: Path, tmp_path: Path) -> None:
    llm = FakeLLM(GOOD_REPLY)
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: (llm, "groq:test-model"))
    first = await svc.generate(sample_repo, "overview")
    assert first["generated_by"] == "groq:test-model"
    assert first["title"] == "Shop system design"
    assert first["cache_hit"] is False and first["mermaid"].startswith("flowchart")
    second = await svc.generate(sample_repo, "overview")
    assert second["cache_hit"] is True and llm.calls == 1
    third = await svc.generate(sample_repo, "overview", refresh=True)
    assert third["cache_hit"] is False and llm.calls == 2
    assert svc.get_cached(sample_repo, "overview")["cache_hit"] is True


async def test_service_regenerates_when_code_changes(sample_repo: Path, tmp_path: Path) -> None:
    llm = FakeLLM(GOOD_REPLY)
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: (llm, "groq:m"))
    await svc.generate(sample_repo, "overview")
    _write(sample_repo, "backend/workers/jobs.py", "import celery\n")
    _write(sample_repo, "backend/workers/more.py", "import celery\n")
    again = await svc.generate(sample_repo, "overview")
    assert again["cache_hit"] is False and llm.calls == 2


@pytest.mark.parametrize("reply", [RuntimeError("429 rate limited"), "not json at all", '{"nodes": []}'])
async def test_service_falls_back_when_llm_fails(sample_repo: Path, tmp_path: Path, reply) -> None:
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: (FakeLLM(reply), "groq:m"))
    result = await svc.generate(sample_repo, "detailed")
    assert result["generated_by"] == "analysis"
    assert result["warnings"] and "code-analysis" in result["warnings"][0]
    assert len(result["nodes"]) >= 5


async def test_service_without_groq_key(sample_repo: Path, tmp_path: Path) -> None:
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: (None, "GROQ_API_KEY is not set."))
    result = await svc.generate(sample_repo)
    assert result["generated_by"] == "analysis"
    assert "GROQ_API_KEY" in result["warnings"][0]
    # cached result is reused even though use_ai=True, because AI is not available
    assert (await svc.generate(sample_repo))["cache_hit"] is True


# API


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from backend.main import app
    from backend.security.rate_limiter import limiter

    with contextlib.suppress(Exception):
        limiter.reset()
    llm = FakeLLM(GOOD_REPLY)
    monkeypatch.setattr(
        sd_service, "_service", SystemDesignService(tmp_path / "sd-cache", llm_factory=lambda: (llm, "groq:test"))
    )
    with TestClient(app) as c:
        yield c


def _register(client: TestClient, name: str) -> dict:
    email = f"{name.lower()}_{tempfile.mktemp()[-6:]}@example.com"
    resp = client.post("/api/auth/register", json={"name": name, "email": email, "password": "SecurePassword123!"})
    if resp.status_code != 200:
        return {}
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_api_generate_and_fetch_cached(client: TestClient, sample_repo: Path) -> None:
    headers = _register(client, "Designer")
    created = client.post("/api/repositories", headers=headers, json={"name": "shop", "source_path": str(sample_repo)})
    assert created.status_code == 201, created.text
    repo_id = created.json()["id"]

    missing = client.get(f"/api/system-design?repository_id={repo_id}", headers=headers)
    assert missing.status_code == 200 and missing.json() is None

    resp = client.post("/api/system-design/generate", headers=headers, json={"repository_id": repo_id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["generated_by"] == "groq:test"
    assert {"nodes", "edges", "groups", "flows", "mermaid"} <= set(body)

    cached = client.get(f"/api/system-design?repository_id={repo_id}", headers=headers)
    assert cached.status_code == 200 and cached.json()["cache_hit"] is True


def test_api_requires_repository(client: TestClient) -> None:
    headers = _register(client, "Nobody")
    resp = client.post("/api/system-design/generate", headers=headers, json={})
    assert resp.status_code == 400


def test_api_other_user_cannot_generate(client: TestClient, sample_repo: Path) -> None:
    owner = _register(client, "Owner")
    other = _register(client, "Other")
    if not owner or not other or owner == other:
        pytest.skip("auth is disabled in this environment; isolation is covered when AUTH_ENABLED=true")
    repo_id = client.post(
        "/api/repositories", headers=owner, json={"name": "shop", "source_path": str(sample_repo)}
    ).json()["id"]
    resp = client.post("/api/system-design/generate", headers=other, json={"repository_id": repo_id})
    assert resp.status_code in (403, 404)


# Provider chain, rate limits, and fallback tests


def test_prompt_and_system_prompt_length_under_12k_chars(sample_repo: Path) -> None:
    """4a: Total length of facts prompt and system prompt is under 12,000 characters."""
    facts = collect_repo_facts(sample_repo)
    draft = build_diagram(facts, "overview")
    prompt = build_prompt(facts, draft)
    total_len = len(prompt) + len(SYSTEM_PROMPT)
    assert total_len < 12_000, f"Expected < 12000 chars, got {total_len}"


@pytest.mark.asyncio
async def test_chain_groq_succeeds_first_time(sample_repo: Path, tmp_path: Path) -> None:
    """1. Groq answers first time -> generated_by starts with groq:, OpenRouter is never called."""
    groq_llm = FakeLLM(GOOD_REPLY)
    openrouter_llm = FakeLLM(RuntimeError("should not be called"))
    chain = [
        (groq_llm, "groq:openai/gpt-oss-120b", {}, "groq"),
        (openrouter_llm, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter"),
    ]
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: chain)
    result = await svc.generate(sample_repo, "overview")

    assert result["generated_by"].startswith("groq:")
    assert groq_llm.calls == 1
    assert openrouter_llm.calls == 0


@pytest.mark.asyncio
async def test_chain_groq_429_retry_after_succeeds_without_openrouter(sample_repo: Path, tmp_path: Path) -> None:
    """2. Groq returns 429 with retry-after: 1, then succeeds -> one retry with sleep(1), no OpenRouter call."""
    groq_llm = FakeLLM(
        [
            ProviderHTTPError(429, "rate limit exceeded", retry_after=1.0),
            GOOD_REPLY,
        ]
    )
    openrouter_llm = FakeLLM(RuntimeError("should not be called"))
    chain = [
        (groq_llm, "groq:openai/gpt-oss-120b", {}, "groq"),
        (openrouter_llm, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter"),
    ]
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: chain)

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await svc.generate(sample_repo, "overview")
        mock_sleep.assert_awaited_once_with(1.0)

    assert result["generated_by"].startswith("groq:")
    assert groq_llm.calls == 2
    assert openrouter_llm.calls == 0


@pytest.mark.asyncio
async def test_chain_groq_429_twice_openrouter_answers(sample_repo: Path, tmp_path: Path) -> None:
    """3. Groq returns 429 twice -> OpenRouter answers -> generated_by starts with openrouter:."""
    groq_llm = FakeLLM(
        [
            ProviderHTTPError(429, "rate limit exceeded", retry_after=1.0),
            ProviderHTTPError(429, "still rate limited", retry_after=1.0),
        ]
    )
    openrouter_llm = FakeLLM(GOOD_REPLY)
    chain = [
        (groq_llm, "groq:openai/gpt-oss-120b", {}, "groq"),
        (openrouter_llm, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter"),
    ]
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: chain)

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await svc.generate(sample_repo, "overview")
        assert mock_sleep.await_count == 1

    assert result["generated_by"].startswith("openrouter:")
    assert groq_llm.calls == 2
    assert openrouter_llm.calls == 1


@pytest.mark.asyncio
async def test_chain_groq_413_no_retry_openrouter_tried(sample_repo: Path, tmp_path: Path) -> None:
    """4. Groq returns 413 -> no retry on Groq -> OpenRouter is tried."""
    groq_llm = FakeLLM(ProviderHTTPError(413, "payload too large"))
    openrouter_llm = FakeLLM(GOOD_REPLY)
    chain = [
        (groq_llm, "groq:openai/gpt-oss-120b", {}, "groq"),
        (openrouter_llm, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter"),
    ]
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: chain)

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        result = await svc.generate(sample_repo, "overview")
        mock_sleep.assert_not_called()

    assert result["generated_by"].startswith("openrouter:")
    assert groq_llm.calls == 1
    assert openrouter_llm.calls == 1


@pytest.mark.asyncio
async def test_chain_groq_400_response_format_retried_once_without_it(sample_repo: Path, tmp_path: Path) -> None:
    """5. Groq returns 400 because of response_format -> retried once without it -> success."""
    call_count = 0

    class FormatSensitiveFakeLLM:
        async def generate(
            self,
            prompt: str,
            system_prompt: str | None = None,
            temperature: float = 0.7,
            *,
            extra_body: dict | None = None,
            model: str | None = None,
        ) -> str:
            nonlocal call_count
            call_count += 1
            if extra_body and "response_format" in extra_body:
                raise ProviderHTTPError(400, "response_format is not supported for this model")
            return GOOD_REPLY

    groq_llm = FormatSensitiveFakeLLM()
    chain = [
        (
            groq_llm,
            "groq:openai/gpt-oss-120b",
            {"max_completion_tokens": 2500, "reasoning_effort": "low", "response_format": {"type": "json_object"}},
            "groq",
        )
    ]
    svc = SystemDesignService(tmp_path / "cache", llm_factory=lambda: chain)
    result = await svc.generate(sample_repo, "overview")

    assert result["generated_by"].startswith("groq:")
    assert call_count == 2


@pytest.mark.asyncio
async def test_chain_both_fail_gives_code_analysis_warning_http_200(
    client: TestClient, sample_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """6. Both fail -> code-analysis diagram plus warning, and no exception reaches the API (HTTP 200)."""
    groq_llm = FakeLLM(ProviderHTTPError(429, "rate limited"))
    openrouter_llm = FakeLLM(ProviderHTTPError(500, "openrouter service down"))
    chain = [
        (groq_llm, "groq:openai/gpt-oss-120b", {}, "groq"),
        (openrouter_llm, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter"),
    ]
    svc = SystemDesignService(tmp_path / "sd-cache-both-fail", llm_factory=lambda: chain)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        result = await svc.generate(sample_repo, "overview")

    assert result["generated_by"] == "analysis"
    assert any("over its free limit right now" in w for w in result["warnings"])

    # Test via API endpoint
    monkeypatch.setattr(sd_service, "_service", svc)
    headers = _register(client, "RateLimitedUser")
    created = client.post("/api/repositories", headers=headers, json={"name": "shop", "source_path": str(sample_repo)})
    repo_id = created.json()["id"]

    with patch("asyncio.sleep", new_callable=AsyncMock):
        resp = client.post("/api/system-design/generate", headers=headers, json={"repository_id": repo_id})

    assert resp.status_code == 200
    data = resp.json()
    assert data["generated_by"] == "analysis"
    assert any("over its free limit right now" in w for w in data["warnings"])


@pytest.mark.asyncio
async def test_chain_only_openrouter_key_set(
    sample_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """7. Only OPENROUTER_API_KEY is set (no Groq key) -> OpenRouter is used."""
    from backend.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "openrouter_api_key", "sk-or-test-key")

    factory_res = default_llm_factory()
    assert isinstance(factory_res, list)
    assert len(factory_res) == 1
    llm_instance, name, extra, ptype = factory_res[0]
    assert name.startswith("openrouter:")
    assert ptype == "openrouter"

    fake_or = FakeLLM(GOOD_REPLY)
    svc = SystemDesignService(
        tmp_path / "cache",
        llm_factory=lambda: [(fake_or, "openrouter:openai/gpt-oss-120b:free", {}, "openrouter")],
    )
    result = await svc.generate(sample_repo, "overview")
    assert result["generated_by"].startswith("openrouter:")
    assert fake_or.calls == 1


@pytest.mark.asyncio
async def test_chain_neither_key_set(sample_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """8. Neither key is set -> code-analysis diagram with the existing 'not set' warning."""
    from backend.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "openrouter_api_key", "")

    factory_res = default_llm_factory()
    assert isinstance(factory_res, tuple)
    assert factory_res[0] is None
    assert "GROQ_API_KEY is not set" in factory_res[1]

    svc = SystemDesignService(tmp_path / "cache", llm_factory=default_llm_factory)
    result = await svc.generate(sample_repo, "overview")
    assert result["generated_by"] == "analysis"
    assert any("GROQ_API_KEY is not set" in w for w in result["warnings"])


@pytest.mark.asyncio
async def test_groq_request_body_contains_options_chat_does_not() -> None:
    """9. Groq request body for system design contains max_completion_tokens, reasoning_effort, and response_format; chat does not."""
    from backend.llm.groq import GroqProvider

    provider = GroqProvider(api_key="sk-test-key", model="openai/gpt-oss-120b")
    captured_payloads: list[dict] = []

    async def mock_post(url, json=None, headers=None):
        captured_payloads.append(dict(json))
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        return resp

    with patch.object(provider, "_get_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_client.post = mock_post
        mock_client_factory.return_value = mock_client

        # 1. System design call path with extra_body
        sys_design_extra = {
            "max_completion_tokens": 2500,
            "reasoning_effort": "low",
            "response_format": {"type": "json_object"},
        }
        await provider.generate("Design prompt", extra_body=sys_design_extra)

        # 2. Chat call path (standard generate without extra_body)
        await provider.generate("Chat prompt", system_prompt="You are a helpful assistant")

    assert len(captured_payloads) == 2
    sd_payload = captured_payloads[0]
    chat_payload = captured_payloads[1]

    # System design payload checks
    assert sd_payload["max_completion_tokens"] == 2500
    assert sd_payload["reasoning_effort"] == "low"
    assert sd_payload["response_format"] == {"type": "json_object"}

    # Chat payload checks: must NOT have system design options
    assert "max_completion_tokens" not in chat_payload
    assert "reasoning_effort" not in chat_payload
    assert "response_format" not in chat_payload
    assert chat_payload["messages"][0]["content"] == "You are a helpful assistant"
