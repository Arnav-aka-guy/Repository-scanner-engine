"""Rate limiting configuration using slowapi.

Exposes a pre-configured ``Limiter`` instance and per-route rate
constants that API routers can import directly.
"""

from __future__ import annotations

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# ── Limiter singleton ──────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)
"""Global rate limiter keyed on the client's remote IP address."""

# ── Per-route rate strings ─────────────────────────────────────────────

SCAN_RATE: str = "5/minute"
"""Repository scanning endpoints (heavy I/O)."""

SEARCH_RATE: str = "30/minute"
"""Code search endpoints."""

CHAT_RATE: str = "20/minute"
"""AI chat / Q-A endpoints."""

FILE_RATE: str = "60/minute"
"""File reading / listing endpoints."""

DEFAULT_RATE: str = "100/minute"
"""Fallback rate for miscellaneous endpoints."""
