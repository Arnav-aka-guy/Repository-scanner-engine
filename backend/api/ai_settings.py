"""AI provider configuration and health-check endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_llm_service():
    """Return the global LLMService singleton."""
    from backend.core.container import get_container

    return get_container().llm_service


class ProviderStatus(BaseModel):
    """Status of a single LLM provider."""

    name: str
    model: str
    active: bool


class ProvidersResponse(BaseModel):
    """Response listing all configured providers."""

    providers: list[ProviderStatus] = Field(default_factory=list)
    active_provider: str = ""


class HealthResponse(BaseModel):
    """Result of an AI provider health check."""

    status: str  # "ok" or "error"
    provider: str
    message: str


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers() -> ProvidersResponse:
    """List all configured AI providers and their status."""
    llm = get_llm_service()
    statuses = llm.get_provider_status()
    return ProvidersResponse(
        providers=[ProviderStatus(**s) for s in statuses],
        active_provider=llm.manager.active_provider_name,
    )


@router.get("/ai-health", response_model=HealthResponse)
async def ai_health_check() -> HealthResponse:
    """Test connectivity to the active AI provider."""
    llm = get_llm_service()
    try:
        response = await llm.manager.generate(
            "Respond with exactly: OK",
            system_prompt="You are a health check bot. Respond with exactly one word: OK",
            temperature=0.0,
        )
        return HealthResponse(
            status="ok",
            provider=llm.manager.active_provider_name,
            message=f"Provider responding. Response: {response[:50]}",
        )
    except Exception as exc:
        return HealthResponse(
            status="error",
            provider=llm.manager.active_provider_name,
            message=str(exc),
        )
