"""Application configuration using Pydantic BaseSettings.

Loads settings from environment variables and .env files. Automatically
creates required data directories on initialization.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, ClassVar

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Known insecure placeholder values that must never be used in production
_INSECURE_SECRETS: frozenset[str] = frozenset(
    {
        "change-me-to-a-random-secret",
        "secret",
        "changeme",
        "your-secret-here",
        "jwt-secret",
        "mysecret",
        "placeholder",
    }
)

_MIN_SECRET_LENGTH: int = 32


class Settings(BaseSettings):
    """Central configuration for the AI Codebase Understanding Engine."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application version ──────────────────────────────────────────────
    app_version: str = "2.0.0"

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
    llm_context_char_budget: int | None = None

    def get_context_char_budget(self, provider: str | None = None) -> int:
        """Return the context character budget for an LLM provider.

        Defaults to 12,000 for Groq and 32,000 for OpenAI/OpenRouter/Ollama.
        Overridable via LLM_CONTEXT_CHAR_BUDGET.
        """
        if self.llm_context_char_budget is not None and self.llm_context_char_budget > 0:
            return self.llm_context_char_budget
        target = (provider or self.llm_provider or "").lower()
        if "groq" in target:
            return 12_000
        return 32_000

    # ── OpenAI settings ────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # ── Groq settings ─────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # ── OpenRouter settings ───────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"

    # ── Database ──────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///data/antigravity.db"
    # When False the application works without a relational database (indexes
    # are stored on the local filesystem only).
    database_enabled: bool = False

    # ── Observability & Logging ─────────────────────────────────────────
    log_level: str = "INFO"
    log_format: str = "text"  # "text" | "json"

    # ── Application Mode ───────────────────────────────────────────────
    app_mode: str = "local"  # "local" | "cloud"

    # ── Authentication ────────────────────────────────────────────────
    local_mode: bool = False
    auth_enabled: bool = False
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "repository-scanner-engine"
    jwt_audience: str = "repository-scanner-client"
    jwt_expiry_hours: int = 1
    refresh_token_expiry_days: int = 7
    admin_username: str = "admin"
    admin_password_hash: str = ""

    # ── SMTP (Optional for password reset) ───────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@antigravity.local"

    # ── CORS ──────────────────────────────────────────────────────────
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # ── Scanning limits ───────────────────────────────────────────────
    max_files: int = 10_000
    max_file_size_bytes: int = 5 * 1024 * 1024  # 5 MB
    max_directory_depth: int = 30

    # ── Path allowlist ────────────────────────────────────────────────
    allowed_roots: list[str] = []
    trusted_proxies: list[str] = ["127.0.0.1", "::1"]

    # ── Directory list for bulk creation ────────────────────────────────
    _SUBDIRS: ClassVar[tuple[str, ...]] = ("graphs", "embeddings", "docs", "cache")

    # ── Validators ───────────────────────────────────────────────────────
    @field_validator("allowed_roots", mode="before")
    @classmethod
    def _parse_allowed_roots(cls, v: Any) -> list[str]:
        raw_list: list[str] = []
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        raw_list = [str(item) for item in parsed]
                except Exception:
                    raw_list = [part.strip() for part in v.split(",") if part.strip()]
            else:
                raw_list = [part.strip() for part in v.split(",") if part.strip()]
        elif isinstance(v, (list, tuple, set)):
            raw_list = [str(item) for item in v]

        result: list[str] = []
        for item in raw_list:
            clean = item.strip().strip("'\"")
            if not clean:
                continue
            try:
                expanded = Path(clean).expanduser().resolve()
                result.append(str(expanded))
            except Exception:
                result.append(clean)
        return result

    @field_validator("trusted_proxies", mode="before")
    @classmethod
    def _parse_trusted_proxies(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["127.0.0.1", "::1"]
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [part.strip() for part in v.split(",") if part.strip()]
        if isinstance(v, (list, tuple, set)):
            return [str(item).strip() for item in v if str(item).strip()]
        return ["127.0.0.1", "::1"]

    @model_validator(mode="after")
    def _validate_and_normalize(self) -> Settings:
        """Validate auth settings and dynamically resolve database_url if using default sqlite."""
        # Dynamic SQLite database URL based on data_dir
        if self.database_url in ("sqlite+aiosqlite:///data/antigravity.db", "sqlite+aiosqlite:///antigravity.db"):
            sqlite_db_path = Path(self.data_dir) / "antigravity.db"
            self.database_url = f"sqlite+aiosqlite:///{sqlite_db_path.as_posix()}"

        mode = self.app_mode.lower().strip()
        if mode == "cloud":
            self.auth_enabled = True
            self.database_enabled = True
            self.local_mode = False
            secret = self.jwt_secret_key
            if not secret or secret.lower() in _INSECURE_SECRETS:
                raise ValueError(
                    "APP_MODE=cloud requires a secure JWT_SECRET_KEY. "
                    "The current value is a known insecure placeholder. "
                    'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
            if len(secret) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"APP_MODE=cloud requires JWT_SECRET_KEY of at least "
                    f"{_MIN_SECRET_LENGTH} characters (got {len(secret)})."
                )

        if self.auth_enabled:
            secret = self.jwt_secret_key
            if not secret or secret.lower() in _INSECURE_SECRETS:
                raise ValueError(
                    "AUTH_ENABLED=true requires a secure JWT_SECRET_KEY. "
                    "The current value is a known insecure placeholder. "
                    'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
                )
            if len(secret) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"AUTH_ENABLED=true requires JWT_SECRET_KEY of at least "
                    f"{_MIN_SECRET_LENGTH} characters (got {len(secret)})."
                )
        return self

    def ensure_directories(self) -> None:
        """Create the data root and all sub-directories if they don't exist."""
        for subdir in self._SUBDIRS:
            Path(os.path.join(self.data_dir, subdir)).mkdir(parents=True, exist_ok=True)


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
