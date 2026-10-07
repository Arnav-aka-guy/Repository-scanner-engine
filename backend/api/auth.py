"""Authentication endpoints for multi-user registration, login, profile, and status."""

import logging
import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.db.database import get_db
from backend.db.repositories import (
    count_user_repositories,
    create_user,
    get_user_by_email,
    get_user_by_id,
)
from backend.security.auth import (
    create_access_token,
    get_required_user,
    hash_password,
    verify_password,
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


# ── Endpoints ───────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse)
@limiter.limit(AUTH_TOKEN_RATE)
async def register_user(
    request: Request,
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
        }
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
    credentials: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate user with email and password, returning a JWT access token."""
    clean_email = credentials.email.strip().lower()
    user = await get_user_by_email(db, clean_email)

    if user is None or not verify_password(credentials.password, user.password_hash):
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

    token = create_access_token(
        data={
            "sub": str(user.id),
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
        }
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


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: dict = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Retrieve authenticated user's account details and current repository quota."""
    user_id = current_user.get("user_id")
    if not user_id and current_user.get("sub"):
        try:
            user_id = int(current_user["sub"])
        except (ValueError, TypeError):
            user_id = 1

    user = await get_user_by_id(db, user_id)
    if user is None:
        # If user record not in DB yet (e.g. from static token), provide payload info
        return UserProfileResponse(
            id=user_id or 1,
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


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    """Return whether authentication is currently enabled on the server."""
    settings = get_settings()
    return AuthStatusResponse(auth_enabled=settings.auth_enabled)
