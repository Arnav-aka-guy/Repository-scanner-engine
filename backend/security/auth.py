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


_MAX_PASSWORD_LENGTH: int = 128
_BCRYPT_MAX_BYTES: int = 72

try:
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher
    from pwdlib.hashers.bcrypt import BcryptHasher

    _password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
except Exception:
    _password_hash = None


def verify_and_update_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    """Verify password and return (is_valid, new_hash_if_needs_upgrade)."""
    if not hashed_password or not plain_password:
        return False, None

    if _password_hash is not None:
        try:
            valid, updated = _password_hash.verify_and_update(plain_password, hashed_password)
            return bool(valid), updated
        except Exception as exc:
            logger.debug("pwdlib verification error: %s", exc)

    # Fallback to direct bcrypt verification
    try:
        import bcrypt

        pw_bytes = plain_password.encode("utf-8")
        if len(pw_bytes) > _BCRYPT_MAX_BYTES and hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            # Bcrypt cannot handle > 72 bytes
            return False, None
        is_valid = bool(bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8")))
        return is_valid, None
    except Exception:
        pass

    try:
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return bool(pwd_context.verify(plain_password, hashed_password)), None
    except Exception:
        return False, None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an Argon2id or bcrypt hash."""
    is_valid, _ = verify_and_update_password(plain_password, hashed_password)
    return is_valid


def hash_password(password: str) -> str:
    """Generate a secure password hash using Argon2id (or bcrypt fallback)."""
    if len(password) > _MAX_PASSWORD_LENGTH:
        raise ValueError(f"Password must not exceed {_MAX_PASSWORD_LENGTH} characters.")

    if _password_hash is not None:
        return str(_password_hash.hash(password))

    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > _BCRYPT_MAX_BYTES:
        raise ValueError("Password must not exceed 72 bytes under bcrypt.")

    try:
        import bcrypt

        return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")
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

_ANON_USER: dict[str, Any] = {"sub": "anonymous", "auth": False, "user_id": 1, "email": "dev@local", "name": "Developer"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency that resolves the current user.

    If credentials are provided, validates and decodes the token.
    If no credentials and AUTH_ENABLED=false, returns anonymous user dict.
    If no credentials and AUTH_ENABLED=true, raises HTTPException(401).
    """
    settings = get_settings()

    if credentials is not None:
        payload = verify_token(credentials.credentials)
        payload["auth"] = True
        if "user_id" not in payload and "sub" in payload:
            try:
                payload["user_id"] = int(payload["sub"])
            except (ValueError, TypeError):
                # When sub is a username (e.g. legacy 'admin')
                if payload["sub"] == "admin":
                    payload["user_id"] = 1
                else:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid user subject in token.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
        return payload

    if not settings.auth_enabled:
        return dict(_ANON_USER)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_required_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency that strictly enforces authentication regardless of server defaults."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials)
    payload["auth"] = True
    if "user_id" not in payload and "sub" in payload:
        try:
            payload["user_id"] = int(payload["sub"])
        except (ValueError, TypeError):
            if payload["sub"] == "admin":
                payload["user_id"] = 1
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user subject in token.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
    return payload
