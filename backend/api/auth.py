"""Authentication endpoints for multi-user registration, login, profile, and status."""

import hashlib
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.db.database import get_db
from backend.db.repositories import (
    count_user_repositories,
    create_refresh_token_record,
    create_user,
    get_refresh_token_record,
    get_user_by_email,
    get_user_by_id,
    increment_user_token_version,
    revoke_refresh_token,
    revoke_user_refresh_tokens,
)
from backend.security.auth import (
    create_access_token,
    create_refresh_token,
    get_required_user,
    hash_password,
    verify_and_update_password,
    verify_password,
    verify_token,
)
from backend.security.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

AUTH_TOKEN_RATE = "10/minute"
EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


# ── Schemas ─────────────────────────────────────────────────────────────


class UserProfileResponse(BaseModel):
    """User account details with repository quota metadata."""

    id: int
    name: str
    email: str
    created_at: datetime | None = None
    repository_count: int = 0
    max_repositories: int = 5


class TokenResponse(BaseModel):
    """JWT Bearer token response with user profile."""

    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse | None = None


class RegisterRequest(BaseModel):
    """Payload for registering a new user."""

    name: str = Field(..., min_length=2, max_length=100, description="Display name")
    email: EmailStr = Field(..., description="Unique email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password (at least 8 characters)")


class UserLoginRequest(BaseModel):
    """User login credentials."""

    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class AdminLoginRequest(BaseModel):
    """Legacy admin credentials."""

    username: str = Field(..., description="Administrator username")
    password: str = Field(..., description="Administrator password")


class AuthStatusResponse(BaseModel):
    """Current authentication enforcement status."""

    auth_enabled: bool


class MessageResponse(BaseModel):
    """Standard message response."""

    message: str


# ── Endpoints ───────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def register_user(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Register a new user account with secure password hashing and return a JWT access token."""
    clean_email = body.email.strip().lower()
    clean_name = body.name.strip()

    if len(clean_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be at least 2 characters.",
        )

    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )

    # Check for duplicate email
    existing_user = await get_user_by_email(db, clean_email)
    if existing_user is not None:
        logger.warning("Registration failed: email %s already registered", clean_email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    pw_hash = hash_password(body.password)
    user = await create_user(
        db,
        name=clean_name,
        email=clean_email,
        password_hash=pw_hash,
    )

    token = create_access_token(
        data={
            "sub": str(user.id),
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "ver": getattr(user, "token_version", 1),
        }
    )

    refresh_token, token_hash, expires_at = create_refresh_token(
        user.id, token_version=getattr(user, "token_version", 1)
    )
    await create_refresh_token_record(
        db, user_id=user.id, token_hash=token_hash, jti=uuid.uuid4().hex, expires_at=expires_at
    )
    await db.commit()

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        expires=int(expires_at.timestamp()),
        path="/api/auth",
    )

    logger.info("New user registered successfully: %s (%s)", user.name, user.email)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            created_at=user.created_at,
            repository_count=0,
            max_repositories=5,
        ),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def login_user(
    request: Request,
    response: Response,
    credentials: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate user with email and password, returning a JWT access token and rotating refresh cookie."""
    clean_email = credentials.email.strip().lower()
    user = await get_user_by_email(db, clean_email)

    is_valid, new_hash = verify_and_update_password(credentials.password, user.password_hash if user else "")

    if user is None or not is_valid:
        # Check backward-compatible admin fallback
        settings = get_settings()
        if (
            settings.admin_password_hash
            and secrets.compare_digest(credentials.email, settings.admin_username)
            and verify_password(credentials.password, settings.admin_password_hash)
        ):
            # Admin login fallback
            admin_user = await get_user_by_email(db, f"{settings.admin_username}@localhost")
            if not admin_user:
                admin_user = await create_user(
                    db,
                    name="Administrator",
                    email=f"{settings.admin_username}@localhost",
                    password_hash=settings.admin_password_hash,
                )
            token = create_access_token(
                data={
                    "sub": str(admin_user.id),
                    "user_id": admin_user.id,
                    "email": admin_user.email,
                    "name": admin_user.name,
                    "ver": getattr(admin_user, "token_version", 1),
                }
            )
            count = await count_user_repositories(db, admin_user.id)
            return TokenResponse(
                access_token=token,
                token_type="bearer",
                user=UserProfileResponse(
                    id=admin_user.id,
                    name=admin_user.name,
                    email=admin_user.email,
                    created_at=admin_user.created_at,
                    repository_count=count,
                    max_repositories=5,
                ),
            )

        logger.warning("Failed login attempt for email: %s", clean_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    # Seamless password upgrade if needs rehash (e.g. from bcrypt to argon2id)
    if new_hash:
        user.password_hash = new_hash
        await db.flush()

    token_version = getattr(user, "token_version", 1)
    token = create_access_token(
        data={
            "sub": str(user.id),
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "ver": token_version,
        }
    )

    # Issue refresh token and persist hashed record
    raw_refresh, token_hash, expires_at = create_refresh_token(user.id, token_version=token_version)
    await create_refresh_token_record(
        db, user_id=user.id, token_hash=token_hash, jti=uuid.uuid4().hex, expires_at=expires_at
    )
    await db.commit()

    # Set httpOnly cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True in HTTPS production
        expires=int(expires_at.timestamp()),
        path="/api/auth",
    )

    repo_count = await count_user_repositories(db, user.id)
    logger.info("User '%s' authenticated successfully", user.email)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            created_at=user.created_at,
            repository_count=repo_count,
            max_repositories=5,
        ),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Rotate refresh token and issue a fresh access token."""
    raw_cookie = request.cookies.get("refresh_token")
    if not raw_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token cookie.",
        )

    try:
        payload = verify_token(raw_cookie, expected_type="refresh")
    except HTTPException:
        response.delete_cookie("refresh_token", path="/api/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from None

    user_id = int(payload["sub"])
    token_hash = hashlib.sha256(raw_cookie.encode("utf-8")).hexdigest()
    record = await get_refresh_token_record(db, token_hash)

    # Reuse detection / revocation
    if not record or record.revoked:
        await revoke_user_refresh_tokens(db, user_id)
        await increment_user_token_version(db, user_id)
        await db.commit()
        response.delete_cookie("refresh_token", path="/api/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Revoked refresh token reused. All sessions terminated.",
        )

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active or user.token_version != payload.get("ver", 1):
        await revoke_refresh_token(db, token_hash)
        await db.commit()
        response.delete_cookie("refresh_token", path="/api/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired.",
        )

    # Revoke current token and issue replacement (rotation)
    await revoke_refresh_token(db, token_hash)
    new_raw_refresh, new_token_hash, new_expires_at = create_refresh_token(user.id, token_version=user.token_version)
    await create_refresh_token_record(
        db, user_id=user.id, token_hash=new_token_hash, jti=uuid.uuid4().hex, expires_at=new_expires_at
    )

    new_access_token = create_access_token(
        data={
            "sub": str(user.id),
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "ver": user.token_version,
        }
    )
    await db.commit()

    response.set_cookie(
        key="refresh_token",
        value=new_raw_refresh,
        httponly=True,
        samesite="lax",
        secure=False,
        expires=int(new_expires_at.timestamp()),
        path="/api/auth",
    )

    repo_count = await count_user_repositories(db, user.id)
    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
        user=UserProfileResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            created_at=user.created_at,
            repository_count=repo_count,
            max_repositories=5,
        ),
    )


@router.post("/logout")
async def logout_user(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke current refresh token and clear cookie."""
    raw_cookie = request.cookies.get("refresh_token")
    if raw_cookie:
        token_hash = hashlib.sha256(raw_cookie.encode("utf-8")).hexdigest()
        await revoke_refresh_token(db, token_hash)
        await db.commit()

    response.delete_cookie("refresh_token", path="/api/auth")
    return MessageResponse(message="Successfully logged out.")


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Retrieve authenticated user's account details and current repository quota."""
    raw_id = current_user.get("user_id")
    if not raw_id and current_user.get("sub"):
        try:
            raw_id = int(current_user["sub"])
        except (ValueError, TypeError):
            raw_id = 1
    uid = int(raw_id) if raw_id else 1

    user = await get_user_by_id(db, uid)
    if user is None:
        # If user record not in DB yet (e.g. from static token), provide payload info
        return UserProfileResponse(
            id=uid,
            name=current_user.get("name", "Developer"),
            email=current_user.get("email", "dev@local"),
            repository_count=0,
            max_repositories=5,
        )

    count = await count_user_repositories(db, user.id)
    return UserProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        created_at=user.created_at,
        repository_count=count,
        max_repositories=5,
    )


@router.post("/token", response_model=TokenResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def login_for_access_token(
    request: Request,
    credentials: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify administrator credentials and issue a signed JWT access token (backward-compatible)."""
    settings = get_settings()

    # First check DB by email or username
    user = await get_user_by_email(db, credentials.username)
    if user and verify_password(credentials.password, user.password_hash):
        token = create_access_token(
            data={"sub": str(user.id), "user_id": user.id, "email": user.email, "name": user.name}
        )
        count = await count_user_repositories(db, user.id)
        return TokenResponse(
            access_token=token,
            user=UserProfileResponse(
                id=user.id,
                name=user.name,
                email=user.email,
                created_at=user.created_at,
                repository_count=count,
                max_repositories=5,
            ),
        )

    # Legacy admin token endpoint requires AUTH_ENABLED=true
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authentication is disabled",
        )

    valid_user = secrets.compare_digest(credentials.username, settings.admin_username)
    valid_pass = verify_password(credentials.password, settings.admin_password_hash)
    if not (valid_user and valid_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(data={"sub": credentials.username, "user_id": 1, "name": "Admin"})
    return TokenResponse(access_token=token)


class ForgotPasswordRequest(BaseModel):
    """Payload for requesting a password reset."""

    email: EmailStr = Field(..., description="Email address associated with account")


class ResetPasswordRequest(BaseModel):
    """Payload for resetting password with a reset token."""

    token: str = Field(..., description="Password reset token")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Initiate password reset flow for a user.

    SECURITY: Returns identical success response regardless of whether email exists
    to prevent user enumeration. In development/local mode, prints reset token to logs.
    """
    clean_email = body.email.strip().lower()
    user = await get_user_by_email(db, clean_email)

    if user is not None:
        reset_token = create_access_token(
            data={"sub": str(user.id), "type": "password_reset", "email": user.email},
            expires_delta=timedelta(minutes=30),
        )
        # Log reset token securely for development / local console
        logger.info(
            "Password reset requested for %s. Reset link: /reset-password?token=%s",
            clean_email,
            reset_token,
        )

    return MessageResponse(message="If an account exists with this email, password reset instructions have been sent.")


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Reset account password using valid reset token."""
    from backend.security.auth import verify_token

    try:
        payload = verify_token(body.token)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        ) from None

    if payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token type for password reset.",
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token subject.",
        )

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user id in reset token.",
        ) from None

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    new_hash = hash_password(body.new_password)
    user.password_hash = new_hash
    await db.commit()
    logger.info("Password successfully reset for user %s (%s)", user.name, user.email)

    return MessageResponse(message="Password successfully reset. You can now log in.")


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    """Return whether authentication is currently enabled on the server."""
    settings = get_settings()
    return AuthStatusResponse(auth_enabled=settings.auth_enabled)
