"""JWT authentication helpers (optional, disabled by default).

When ``AUTH_ENABLED=true`` in the environment the ``get_current_user``
dependency enforces Bearer-token authentication. When disabled it
returns a sentinel anonymous user dict so endpoints always have a
consistent shape.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

# ── Security scheme ────────────────────────────────────────────────────
# ``auto_error=False`` lets us make the token *optional* when auth is off.
_bearer_scheme = HTTPBearer(auto_error=False)


# ── Password hashing helpers ───────────────────────────────────────────


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    if not hashed_password:
        return False
    try:
        import bcrypt

        return bool(bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8")))
    except Exception:
        try:
            from passlib.context import CryptContext

            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            return bool(pwd_context.verify(plain_password, hashed_password))
        except Exception:
            return False


def hash_password(password: str) -> str:
    """Generate a bcrypt password hash."""
    try:
        import bcrypt

        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except Exception:
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return str(pwd_context.hash(password))


# ── Token helpers ──────────────────────────────────────────────────────


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        data: Arbitrary claims to include in the token payload.
        expires_delta: Custom lifetime; defaults to the configured
            ``jwt_expiry_hours``.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    to_encode = data.copy()

    expire = datetime.now(UTC) + (
        expires_delta if expires_delta is not None else timedelta(hours=settings.jwt_expiry_hours)
    )
    to_encode["exp"] = expire

    encoded = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    logger.debug("Access token created, expires at %s", expire.isoformat())
    return str(encoded)


def verify_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT token.

    Args:
        token: Raw JWT string.

    Returns:
        The decoded payload as a dict.

    Raises:
        HTTPException(401): If the token is invalid or expired.
    """
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ── FastAPI dependency ─────────────────────────────────────────────────

_ANON_USER: dict[str, Any] = {"sub": "anonymous", "auth": False}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency that resolves the current user.

    Behaviour depends on ``AUTH_ENABLED``:
    * **False** (default): returns an anonymous sentinel user; no token
      required.
    * **True**: requires a valid Bearer token and returns the decoded
      payload.

    Raises:
        HTTPException(401): When auth is enabled but the token is
            missing or invalid.
    """
    settings = get_settings()

    if not settings.auth_enabled:
        return _ANON_USER

    # Auth is enabled – a token is mandatory.
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials)
    payload["auth"] = True
    return payload
