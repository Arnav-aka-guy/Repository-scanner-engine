"""Per-user daily allowance for AI calls.

When the app is hosted with the owner's own Groq/OpenRouter key, one user could
use up the whole free quota for everyone. Set AI_DAILY_LIMIT_PER_USER to a number
above 0 to cap AI requests per user per UTC day. 0 (the default) means no cap,
which is right for the local single-user app.

Counts are kept in memory, so they reset when the server restarts. That is a
deliberate trade-off: no database table, no extra service, and a restart only
ever gives users more requests, never fewer.
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status

from backend.core.config import get_settings

_lock = threading.Lock()
_counts: dict[tuple[str, str], int] = {}


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _user_key(current_user: dict[str, Any] | None) -> str:
    if current_user and current_user.get("user_id") is not None:
        return f"user:{current_user['user_id']}"
    return "local"


def consume_ai_request(current_user: dict[str, Any] | None) -> None:
    """Count one AI request for this user, or raise 429 if today's allowance is used up."""
    limit = int(getattr(get_settings(), "ai_daily_limit_per_user", 0) or 0)
    if limit <= 0:
        return
    key = (_user_key(current_user), _today())
    with _lock:
        # Drop counters from earlier days so the dict cannot grow forever.
        for old in [k for k in _counts if k[1] != key[1]]:
            _counts.pop(old, None)
        used = _counts.get(key, 0)
        if used >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You have used today's {limit} AI requests. The allowance resets at midnight UTC. "
                    "Features that do not need AI keep working."
                ),
            )
        _counts[key] = used + 1


def remaining_ai_requests(current_user: dict[str, Any] | None) -> int | None:
    """Return how many AI requests are left today, or None when there is no cap."""
    limit = int(getattr(get_settings(), "ai_daily_limit_per_user", 0) or 0)
    if limit <= 0:
        return None
    with _lock:
        return max(0, limit - _counts.get((_user_key(current_user), _today()), 0))


def reset_ai_quota() -> None:
    """Clear all counters (used by tests)."""
    with _lock:
        _counts.clear()
