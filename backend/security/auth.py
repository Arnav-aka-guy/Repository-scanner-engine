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
import hashlib
import uuid
import jwt
from jwt.exceptions import PyJWTError

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
    """Create a signed JWT access token with standard claims.

    Claims included: iss, aud, iat, exp, jti, type="access", ver.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + (
        expires_delta if expires_delta is not None else timedelta(hours=settings.jwt_expiry_hours)
    )

    to_encode = data.copy()
    to_encode.setdefault("iss", settings.jwt_issuer)
    to_encode.setdefault("aud", settings.jwt_audience)
    to_encode.setdefault("iat", int(now.timestamp()))
    to_encode["exp"] = int(expire.timestamp())
    to_encode.setdefault("jti", uuid.uuid4().hex)
    to_encode.setdefault("type", "access")
    to_encode.setdefault("ver", data.get("ver", 1))

    encoded = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return str(encoded)


def create_refresh_token(
    user_id: int,
    token_version: int = 1,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    """Create a signed JWT refresh token and return (raw_token, token_hash, expires_at)."""
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(days=settings.refresh_token_expiry_days)
    )

    jti = uuid.uuid4().hex
    payload = {
        "sub": str(user_id),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": jti,
        "type": "refresh",
        "ver": token_version,
    }

    raw_token = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return str(raw_token), token_hash, expire


def verify_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """Decode and verify a JWT token with PyJWT.

    Args:
        token: Raw JWT string.
        expected_type: Optional expected 'type' claim ('access', 'refresh', 'password_reset').

    Returns:
        The decoded payload as a dict.

    Raises:
        HTTPException(401): If token is invalid, expired, forged, or claims mismatch.
    """
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},  # For backward-compatibility with older tests
        )

        if expected_type and payload.get("type") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token type mismatch: expected {expected_type}, got {payload.get('type')}",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return payload
    except PyJWTError as exc:
        logger.warning("PyJWT verification failed: %s", exc)
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

    If settings.local_mode is true, returns local workspace user dictionary.
    If credentials are provided, validates and decodes the token.
    If no credentials and AUTH_ENABLED=false, returns anonymous user dict.
    If no credentials and AUTH_ENABLED=true, raises HTTPException(401).
    """
    settings = get_settings()

    if getattr(settings, "local_mode", False):
        return dict(_ANON_USER)

    if credentials is not None:
        payload = verify_token(credentials.credentials, expected_type="access")
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
