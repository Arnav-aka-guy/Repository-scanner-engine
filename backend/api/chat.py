"""AI chat / Q&A endpoints with streaming support."""

import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.api.dependencies import get_llm, get_parser, get_retrieval
from backend.llm.service import LLMService
from backend.parser.service import ParserService
from backend.retrieval.service import RetrievalService
from backend.security.input_sanitizer import SanitizedChatInput, SanitizedRepoPath
from backend.security.path_validator import validate_repository_path
from backend.security.rate_limiter import CHAT_RATE, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── In-memory conversation history (repo-scoped) ─────────────────────────

_conversation_history: list[dict[str, str]] = []
_repo_conversation_history: dict[str, list[dict[str, str]]] = {}


# ── Request / Response schemas ──────────────────────────────────────────


class ChatRequest(BaseModel):
    """Body for the chat endpoint."""

    question: str = Field(..., min_length=1, description="User question about the codebase")
    repo_path: str = Field(..., description="Absolute path to the repository root")


class ChatHistoryEntry(BaseModel):
    """A single entry in the conversation history."""

    timestamp: str
    question: str
    answer: str


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
):
    """Answer a question about the codebase using RAG.

    Retrieves relevant context via the retrieval service, then streams the
    LLM response back as Server-Sent Events (``text/event-stream``).
    """
    # Sanitize inputs before processing
    sanitized = SanitizedChatInput(question=body.question, repo_path=body.repo_path)
    path = validate_repository_path(sanitized.repo_path)
    repo_key = str(path)

    try:
        parsed_files = await parser.parse_repository(repo_key)
        retrieval_res = await retrieval.retrieve(
            sanitized.question,
            parsed_files,
            top_k=5,
            repo_path=repo_key,
        )
        context = retrieval_res.get("merged_context", "")
    except Exception as exc:
        logger.error("Context retrieval failed for %s: %s", path.name, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Context retrieval failed.",
        ) from exc

    async def _event_stream():
        """Yield SSE-formatted chunks from the LLM and persist the answer."""
        collected_chunks: list[str] = []

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
                user_msg = f"LLM Error: {detail}"
            else:
                user_msg = f"LLM Error: {msg}"
            error_payload = json.dumps({"type": "error", "content": user_msg})
            yield f"data: {error_payload}\n\n"
            return

        full_answer = "".join(collected_chunks)

        entry = {
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "question": sanitized.question,
            "answer": full_answer,
        }
        _conversation_history.append(entry)
        if repo_key not in _repo_conversation_history:
            _repo_conversation_history[repo_key] = []
        _repo_conversation_history[repo_key].append(entry)

        done_payload = json.dumps({"type": "done", "content": full_answer})
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
async def get_history(repo_path: str | None = None) -> list[ChatHistoryEntry]:
    """Return conversation history, optionally filtered by repository."""
    if repo_path:
        sanitized = SanitizedRepoPath(path=repo_path)
        path = validate_repository_path(sanitized.path)
        entries = _repo_conversation_history.get(str(path), [])
    else:
        entries = _conversation_history

    return [
        ChatHistoryEntry(
            timestamp=entry["timestamp"],
            question=entry["question"],
            answer=entry["answer"],
        )
        for entry in entries
    ]
