"""Application configuration using Pydantic BaseSettings.

Loads settings from environment variables and .env files. Automatically
creates required data directories on initialization.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the AI Codebase Understanding Engine."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Data directories ────────────────────────────────────────────────
    data_dir: str = "data"

    @property
    def graphs_dir(self) -> str:
        return os.path.join(self.data_dir, "graphs")

    @property
    def embeddings_dir(self) -> str:
        return os.path.join(self.data_dir, "embeddings")

    @property
    def docs_dir(self) -> str:
        return os.path.join(self.data_dir, "docs")

    @property
    def cache_dir(self) -> str:
        return os.path.join(self.data_dir, "cache")

    # ── Embedding settings ──────────────────────────────────────────────
    embedding_model: str = "all-MiniLM-L6-v2"

    # ── LLM settings ───────────────────────────────────────────────────
    llm_provider: str = "auto"  # "auto" | "ollama" | "openai" | "groq" | "openrouter"
    llm_model: str = "llama3"
    llm_base_url: str = "http://localhost:11434"

    # ── OpenAI settings ────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # ── Groq settings ─────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # ── OpenRouter settings ───────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"

    # ── Database ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/antigravity"

    # ── Authentication ────────────────────────────────────────────────
    auth_enabled: bool = False
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # ── Directory list for bulk creation ────────────────────────────────
    _SUBDIRS: ClassVar[tuple[str, ...]] = ("graphs", "embeddings", "docs", "cache")

    def ensure_directories(self) -> None:
        """Create the data root and all sub-directories if they don't exist."""
        for subdir in self._SUBDIRS:
            Path(os.path.join(self.data_dir, subdir)).mkdir(
                parents=True, exist_ok=True
            )


# ── Module-level singleton ──────────────────────────────────────────────
_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the global Settings singleton, creating it on first call."""
    global _settings  # noqa: PLW0603
    if _settings is None:
        _settings = Settings()
        _settings.ensure_directories()
    return _settings


# Global settings instance
settings = get_settings()

