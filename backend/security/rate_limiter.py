"""Rate limiting configuration using slowapi.

Exposes a pre-configured ``Limiter`` instance and per-route rate
constants that API routers can import directly.
"""

from __future__ import annotations

import logging
from typing import Any

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

logger = logging.getLogger(__name__)


def get_user_or_ip(request: Request | Any) -> str:
    """Return user identifier if authenticated (from state, token header, or cookie), else IP."""
    user = getattr(request.state, "user", None)
    if isinstance(user, dict) and user.get("user_id"):
        return f"user:{user['user_id']}"

    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            import jwt

            unverified = jwt.decode(token, options={"verify_signature": False})
            uid = unverified.get("user_id") or unverified.get("sub")
            if uid:
                return f"user:{uid}"
        except Exception:
            pass

    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            import jwt

            unverified = jwt.decode(access_token, options={"verify_signature": False})
            uid = unverified.get("user_id") or unverified.get("sub")
            if uid:
                return f"user:{uid}"
        except Exception:
            pass

    return get_remote_address(request)


# ── Limiter singleton ──────────────────────────────────────────────────

limiter = Limiter(key_func=get_user_or_ip)
"""Global rate limiter keyed on user_id when authenticated, IP address otherwise."""

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
