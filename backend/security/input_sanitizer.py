"""Pydantic models for strict input sanitization.

Each model strips dangerous characters and enforces length limits
before the data reaches any business logic.
"""

from __future__ import annotations

import logging
import re
import unicodedata

from pydantic import BaseModel, Field, field_validator

from backend.core.constants import (
    MAX_CHAT_MESSAGE_LENGTH,
    MAX_QUERY_LENGTH,
    MAX_REPO_PATH_LENGTH,
)

logger = logging.getLogger(__name__)

# Matches C0 + C1 control characters *except* common whitespace (tab, LF, CR).
_CONTROL_CHAR_RE = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]",
)


def _strip_control_chars(value: str) -> str:
    """Remove control characters while keeping tabs, newlines, and CRs."""
    return _CONTROL_CHAR_RE.sub("", value)


def _reject_null_bytes(value: str, field_name: str) -> str:
    """Raise ``ValueError`` if the string contains embedded null bytes."""
    if "\x00" in value:
        raise ValueError(f"{field_name} must not contain null bytes.")
    return value


# ── Sanitized path ──────────────────────────────────────────────────────


class SanitizedRepoPath(BaseModel):
    """Validated repository path string."""

    path: str = Field(
        ...,
        max_length=MAX_REPO_PATH_LENGTH,
        description="Filesystem path to a repository directory.",
    )

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        """Strip whitespace, reject null bytes and control chars."""
        v = v.strip()
        if not v:
            raise ValueError("Repository path must not be empty.")
        v = _reject_null_bytes(v, "path")
        v = _strip_control_chars(v)
        # Normalise unicode to NFC to avoid homoglyph tricks
        v = unicodedata.normalize("NFC", v)
        return v


# ── Sanitized search query ──────────────────────────────────────────────


class SanitizedQuery(BaseModel):
    """Validated free-text search query."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=MAX_QUERY_LENGTH,
        description="Search query text.",
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        """Strip control characters and trim whitespace."""
        v = v.strip()
        if not v:
            raise ValueError("Query must not be empty after trimming.")
        v = _reject_null_bytes(v, "query")
        v = _strip_control_chars(v)
        return v


# ── Sanitized chat input ───────────────────────────────────────────────


class SanitizedChatInput(BaseModel):
    """Validated chat / Q-A input payload."""

    question: str = Field(
        ...,
        min_length=1,
        max_length=MAX_CHAT_MESSAGE_LENGTH,
        description="User question to the AI assistant.",
    )
    repo_path: str = Field(
        ...,
        max_length=MAX_REPO_PATH_LENGTH,
        description="Path to the repository the question relates to.",
    )

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        """Strip control characters and trim whitespace."""
        v = v.strip()
        if not v:
            raise ValueError("Question must not be empty after trimming.")
        v = _reject_null_bytes(v, "question")
        v = _strip_control_chars(v)
        return v

    @field_validator("repo_path")
    @classmethod
    def validate_repo_path(cls, v: str) -> str:
        """Strip whitespace, reject null bytes and control chars."""
        v = v.strip()
        if not v:
            raise ValueError("Repository path must not be empty.")
        v = _reject_null_bytes(v, "repo_path")
        v = _strip_control_chars(v)
        v = unicodedata.normalize("NFC", v)
        return v
