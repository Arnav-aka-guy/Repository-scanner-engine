"""AI chat / Q&A endpoints with streaming support."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.api.dependencies import get_llm, get_parser, get_retrieval
from backend.security.path_validator import validate_repository_path

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.llm.service import LLMService
    from backend.parser.service import ParserService
    from backend.retrieval.service import RetrievalService

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── In-memory conversation history ──────────────────────────────────────

_conversation_history: list[dict[str, str]] = []


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


@router.post("/")
async def chat(
    body: ChatRequest,
    retrieval: RetrievalService = Depends(get_retrieval),
    llm: LLMService = Depends(get_llm),
    parser: ParserService = Depends(get_parser),
) -> StreamingResponse:
    """Answer a question about the codebase using RAG.

    Retrieves relevant context via the retrieval service, then streams the
    LLM response back as Server-Sent Events (``text/event-stream``).
    """
    path = validate_repository_path(body.repo_path)

    try:
        parsed_files = await parser.parse_repository(str(path))
        retrieval_res = await retrieval.retrieve(body.question, parsed_files, top_k=5)
        context = retrieval_res.get("merged_context", "")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Context retrieval failed: {exc}",
        ) from exc

    async def _event_stream():
        """Yield SSE-formatted chunks from the LLM and persist the answer."""
        collected_chunks: list[str] = []

        try:
            async for chunk in llm.answer_question_stream(body.question, context):
                collected_chunks.append(chunk)
                payload = json.dumps({"type": "chunk", "content": chunk})
                yield f"data: {payload}\n\n"
        except Exception as exc:
            error_payload = json.dumps({"type": "error", "content": str(exc)})
            yield f"data: {error_payload}\n\n"
            return

        full_answer = "".join(collected_chunks)

        _conversation_history.append(
            {
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "question": body.question,
                "answer": full_answer,
            }
        )

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
async def get_history() -> list[ChatHistoryEntry]:
    """Return the full conversation history for the current session."""
    return [
        ChatHistoryEntry(
            timestamp=entry["timestamp"],
            question=entry["question"],
            answer=entry["answer"],
        )
        for entry in _conversation_history
    ]
