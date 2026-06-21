"""AI chat / Q&A endpoints with streaming support."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/chat", tags=["chat"])


def get_retrieval_service():
    """Return the global RetrievalService singleton."""
    from backend.core.container import get_container
    return get_container().retrieval_service


def get_llm_service():
    """Return the global LLMService singleton."""
    from backend.core.container import get_container
    return get_container().llm_service


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
async def chat(body: ChatRequest) -> StreamingResponse:
    """Answer a question about the codebase using RAG.

    Retrieves relevant context via the retrieval service, then streams the
    LLM response back as Server-Sent Events (``text/event-stream``).
    """
    retrieval = get_retrieval_service()
    llm = get_llm_service()
    from backend.core.container import get_container
    container = get_container()

    try:
        parsed_files = await container.parser_service.parse_repository(body.repo_path)
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
