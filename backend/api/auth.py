"""Authentication endpoints for single-user admin login and status."""

import logging
import secrets

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.core.config import get_settings
from backend.security.auth import create_access_token, verify_password
from backend.security.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

AUTH_TOKEN_RATE = "5/minute"


class LoginRequest(BaseModel):
    """User credentials for token issuance."""

    username: str = Field(..., description="Administrator username")
    password: str = Field(..., description="Administrator password")


class TokenResponse(BaseModel):
    """JWT Bearer token response."""

    access_token: str
    token_type: str = "bearer"


class AuthStatusResponse(BaseModel):
    """Current authentication enforcement status."""

    auth_enabled: bool


@router.post("/token", response_model=TokenResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def login_for_access_token(
    request: Request,
    credentials: LoginRequest,
) -> TokenResponse:
    """Verify administrator credentials and issue a signed JWT access token."""
    settings = get_settings()

    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication is disabled",
        )

    valid_user = secrets.compare_digest(credentials.username, settings.admin_username)
    valid_pass = verify_password(credentials.password, settings.admin_password_hash)

    if not (valid_user and valid_pass):
        logger.warning("Failed login attempt for user '%s'", credentials.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": credentials.username})
    logger.info("Admin user '%s' authenticated successfully", credentials.username)
    return TokenResponse(access_token=token)


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    """Return whether authentication is currently enabled on the server."""
    settings = get_settings()
    return AuthStatusResponse(auth_enabled=settings.auth_enabled)
