"""Rate limiting configuration using slowapi.

Exposes a pre-configured ``Limiter`` instance and per-route rate
constants that API routers can import directly.
"""

from __future__ import annotations

import logging
from typing import Any

from slowapi import Limiter
from starlette.requests import Request

logger = logging.getLogger(__name__)


def get_user_or_ip(request: Request | Any) -> str:
    """Return user identifier if authenticated (from state or cryptographically verified token), else trusted IP."""
    user = getattr(request.state, "user", None)
    if isinstance(user, dict) and user.get("user_id"):
        return f"user:{user['user_id']}"

    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    token: str | None = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif hasattr(request, "cookies") and request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if token:
        try:
            from backend.security.auth import verify_token

            payload = verify_token(token, expected_type="access")
            uid = payload.get("user_id") or payload.get("sub")
            if uid:
                return f"user:{uid}"
        except Exception:
            # Token invalid, forged, or expired — do NOT trust claims from it
            pass

    # Resolve client IP using trusted proxies check
    client_host: str = "127.0.0.1"
    if hasattr(request, "client") and request.client and request.client.host:
        client_host = request.client.host

    try:
        from backend.core.config import get_settings

        settings = get_settings()
        trusted = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1"])

        if client_host in trusted:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                client_host = forwarded.split(",")[0].strip()
    except Exception:
        pass

    return client_host


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
