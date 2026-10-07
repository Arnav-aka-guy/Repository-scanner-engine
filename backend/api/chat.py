"""AI chat / Q&A endpoints with streaming support."""

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_llm, get_parser, get_retrieval
from backend.db.database import get_db
from backend.db.models import Repository
from backend.llm.service import LLMService
from backend.parser.service import ParserService
from backend.retrieval.service import RetrievalService
from backend.security.auth import get_current_user
from backend.security.input_sanitizer import SanitizedChatInput, SanitizedRepoPath
from backend.security.path_validator import validate_repository_path
from backend.security.rate_limiter import CHAT_RATE, limiter
from backend.storage.persistence import (
    append_chat_message,
    delete_chat_history,
    load_chat_data,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

_API_KEY_PATTERNS = [
    re.compile(r"gsk_[a-zA-Z0-9_\-]{10,}"),
    re.compile(r"sk-[a-zA-Z0-9_\-]{10,}"),
    re.compile(r"Bearer\s+[a-zA-Z0-9_\-\.]{10,}", re.IGNORECASE),
    re.compile(r"(?:api[-_]?key|secret)[=:\s]+[a-zA-Z0-9_\-]{10,}", re.IGNORECASE),
]


def _sanitize_error_message(msg: str, max_length: int = 300) -> str:
    """Cap error message length (~300 chars) and redact API keys/tokens."""
    cleaned = msg
    for pattern in _API_KEY_PATTERNS:
        cleaned = pattern.sub("[REDACTED]", cleaned)
    if len(cleaned) > max_length:
        cleaned = cleaned[: max_length - 3].rstrip() + "..."
    return cleaned


# ── File-backed conversation history (repo-scoped) ─────────────────────────

_chat_state = load_chat_data()
_conversation_history: list[dict[str, str]] = _chat_state.get("global", [])
_repo_conversation_history: dict[str, list[dict[str, str]]] = _chat_state.get("by_repo", {})


# ── Request / Response schemas ──────────────────────────────────────────


class ChatRequest(BaseModel):
    """Body for the chat endpoint."""

    question: str = Field(..., min_length=1, description="User question about the codebase")
    repo_path: str = Field(..., description="Absolute path to the repository root")
    conversation_id: str | None = Field(default=None, description="Optional conversation session ID")


class ChatHistoryEntry(BaseModel):
    """A single entry in the conversation history."""

    timestamp: str
    question: str
    answer: str
    conversation_id: str | None = None


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("", response_class=StreamingResponse)
@router.post("/", response_class=StreamingResponse)
@limiter.limit(CHAT_RATE)
async def chat(
    request: Request,
    body: ChatRequest,
    retrieval: RetrievalService = Depends(get_retrieval),
    llm: LLMService = Depends(get_llm),
    parser: ParserService = Depends(get_parser),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Answer a question about the codebase using RAG.

    Retrieves relevant context via the retrieval service, then streams the
    LLM response back as Server-Sent Events (``text/event-stream``).
    """
    # Sanitize inputs before processing
    sanitized = SanitizedChatInput(question=body.question, repo_path=body.repo_path)
    path = validate_repository_path(sanitized.repo_path)
    repo_key = str(path)

    # Strict user isolation check
    if current_user.get("auth") and current_user.get("user_id"):
        user_id = int(current_user["user_id"])
        norm_path = repo_key.replace("\\", "/").rstrip("/")
        stmt = select(Repository).where(
            (Repository.path == norm_path) | (Repository.source_path == norm_path)
        )
        res = await db.execute(stmt)
        repo = res.scalar_one_or_none()
        if repo and repo.user_id is not None and repo.user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied: You do not have permission to access this repository.",
            )

    try:
        parsed_files = await parser.parse_repository(repo_key)
        retrieval_res = await retrieval.retrieve(
            sanitized.question,
            parsed_files,
            top_k=5,
            repo_path=repo_key,
        )
        vector_results = retrieval_res.get("vector_results", [])
        graph_results = retrieval_res.get("graph_results", [])
        context = retrieval_res.get("merged_context", "")

        has_retrieval_context = bool(vector_results or graph_results)
        confidence_prefix = ""
        if not has_retrieval_context or not context.strip() or context.startswith("No relevant code context"):
            confidence_prefix = (
                "ℹ️ *Limited codebase context available for this question. "
                "The answer is based on general knowledge and repository structure.*\n\n"
            )
    except Exception as exc:
        logger.error("Context retrieval failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Context retrieval failed.",
        ) from exc

    async def _event_stream():
        """Yield SSE-formatted chunks from the LLM and persist the answer."""
        collected_chunks: list[str] = []

        if confidence_prefix:
            collected_chunks.append(confidence_prefix)
            yield f"data: {json.dumps({'type': 'chunk', 'content': confidence_prefix})}\n\n"

        try:
            async for chunk in llm.answer_question_stream(sanitized.question, context):
                collected_chunks.append(chunk)
                payload = json.dumps({"type": "chunk", "content": chunk})
                yield f"data: {payload}\n\n"
        except Exception as exc:
            logger.error("LLM streaming error: %s", exc, exc_info=True)
            msg = str(exc)
            if "All LLM providers failed" in msg:
                bullets = [line.strip().lstrip("• ") for line in msg.splitlines() if line.strip().startswith("•")]
                detail = bullets[0] if bullets else "Inference provider temporarily unavailable."
                raw_msg = f"LLM Error: {detail}"
            else:
                raw_msg = f"LLM Error: {msg}"
            user_msg = _sanitize_error_message(raw_msg, max_length=300)
            error_payload = json.dumps({"type": "error", "content": user_msg})
            yield f"data: {error_payload}\n\n"
            return

        full_answer = "".join(collected_chunks)

        # Ground citations: verify retrieved sources against actual repository files
        verified_sources = []
        seen_sources = set()
        for src in (vector_results + graph_results):
            fpath = src.get("file_path", "")
            if not fpath:
                continue

            full_target = Path(fpath) if Path(fpath).is_absolute() else (path / fpath)
            is_valid_file = fpath in parsed_files or str(full_target.resolve()) in parsed_files or full_target.exists()
            if not is_valid_file:
                continue

            s_line = int(src.get("start_line", 0))
            e_line = int(src.get("end_line", 0))

            pf = parsed_files.get(fpath) or parsed_files.get(str(full_target.resolve()))
            valid_lines = False
            if pf:
                max_line = max(
                    [func.end_line for func in pf.functions] + [cls.end_line for cls in pf.classes] + [1]
                )
                if 1 <= s_line <= max_line:
                    valid_lines = True

            key = (fpath, src.get("entity_name", ""))
            if key not in seen_sources:
                seen_sources.add(key)
                verified_sources.append({
                    "file_path": fpath,
                    "entity_name": src.get("entity_name", ""),
                    "entity_type": src.get("entity_type", ""),
                    "start_line": s_line if (valid_lines and s_line > 0) else None,
                    "end_line": e_line if (valid_lines and e_line > 0) else None,
                    "verified": True,
                })

        entry = {
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "question": sanitized.question,
            "answer": full_answer,
            "conversation_id": body.conversation_id,
            "sources": verified_sources[:6],
        }
        _conversation_history.append(entry)
        if repo_key not in _repo_conversation_history:
            _repo_conversation_history[repo_key] = []
        _repo_conversation_history[repo_key].append(entry)

        # Persist message to disk
        append_chat_message(
            repo_path=repo_key,
            entry=entry,
            conversation_id=body.conversation_id,
        )

        done_payload = json.dumps({
            "type": "done",
            "content": full_answer,
            "sources": verified_sources[:6],
        })
        yield f"data: {done_payload}\n\n"

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history", response_model=list[ChatHistoryEntry])
async def get_history(
    repo_path: str | None = None,
    conversation_id: str | None = None,
) -> list[ChatHistoryEntry]:
    """Return conversation history, optionally filtered by repository or conversation."""
    data = load_chat_data()
    if conversation_id:
        conv = data.get("conversations", {}).get(conversation_id, {})
        entries = conv.get("messages", [])
    elif repo_path:
        sanitized = SanitizedRepoPath(path=repo_path)
        path = validate_repository_path(sanitized.path)
        entries = data.get("by_repo", {}).get(str(path), [])
    else:
        entries = data.get("global", [])

    return [
        ChatHistoryEntry(
            timestamp=entry["timestamp"],
            question=entry["question"],
            answer=entry["answer"],
            conversation_id=entry.get("conversation_id"),
        )
        for entry in entries
    ]


@router.delete("/history")
async def clear_chat_history(
    repo_path: str | None = None,
    conversation_id: str | None = None,
) -> dict[str, str]:
    """Clear chat conversation history from persistent storage."""
    global _conversation_history, _repo_conversation_history
    delete_chat_history(repo_path=repo_path, conversation_id=conversation_id)

    if conversation_id:
        # Filter in-memory
        _conversation_history = [e for e in _conversation_history if e.get("conversation_id") != conversation_id]
        for rk in _repo_conversation_history:
            _repo_conversation_history[rk] = [
                e for e in _repo_conversation_history[rk] if e.get("conversation_id") != conversation_id
            ]
    elif repo_path:
        sanitized = SanitizedRepoPath(path=repo_path)
        path = validate_repository_path(sanitized.path)
        _repo_conversation_history.pop(str(path), None)
    else:
        _conversation_history.clear()
        _repo_conversation_history.clear()

    return {"status": "cleared", "message": "Chat history cleared successfully"}


@router.get("/conversations")
async def list_conversations(repo_path: str | None = None) -> list[dict]:
    """List persistent chat conversations."""
    data = load_chat_data()
    convs = list(data.get("conversations", {}).values())
    if repo_path:
        norm = repo_path.replace("\\", "/").rstrip("/")
        convs = [c for c in convs if (c.get("repo_path") or "").replace("\\", "/").rstrip("/") == norm]
    convs.sort(key=lambda c: c.get("updated_at", 0), reverse=True)
    return convs
