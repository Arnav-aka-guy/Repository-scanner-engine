"""Path validation utilities to prevent directory traversal and system access.

Every public function raises ``fastapi.HTTPException(403)`` on failure so
callers never have to interpret return codes.
"""

from __future__ import annotations

import logging
import platform
from pathlib import Path

from fastapi import HTTPException

from backend.core.config import settings
from backend.core.constants import (
    BLOCKED_PATHS_UNIX,
    BLOCKED_PATHS_WINDOWS,
)

logger = logging.getLogger(__name__)

_IS_WINDOWS = platform.system() == "Windows"

# Sensitive directory components forbidden when allowed_roots is empty
_SENSITIVE_PARTS: frozenset[str] = frozenset({".ssh", ".aws", ".gnupg", ".config", ".env"})

# Sensitive components forbidden in file paths even inside repo root
_SENSITIVE_FILE_PARTS: frozenset[str] = frozenset({".ssh", ".aws", ".gnupg", ".config", ".env", ".git"})


def _has_sensitive_component(path: Path) -> bool:
    """Return True if path contains any hidden sensitive directory component."""
    for part in path.parts:
        lower = part.lower()
        if lower in _SENSITIVE_PARTS or lower.startswith(".env"):
            return True
    return False


def _has_sensitive_file_component(path_parts: tuple[str, ...]) -> bool:
    """Return True if any part in path_parts matches sensitive names."""
    for part in path_parts:
        lower = part.lower()
        if lower in _SENSITIVE_FILE_PARTS or lower.startswith(".env") or lower.startswith(".git"):
            return True
    return False


# ── Internal helpers ────────────────────────────────────────────────────


def _blocked_paths() -> frozenset[str]:
    """Return the set of blocked root paths for the current OS."""
    return BLOCKED_PATHS_WINDOWS if _IS_WINDOWS else BLOCKED_PATHS_UNIX


def _is_under_blocked_path(resolved: Path) -> bool:
    """Return True if *resolved* is equal to or beneath a blocked path."""
    resolved_str = str(resolved)
    for blocked in _blocked_paths():
        blocked_path = Path(blocked).resolve()
        if resolved == blocked_path or resolved_str.startswith(str(blocked_path) + ("/" if not _IS_WINDOWS else "\\")):
            return True
        # Also check with os.sep normalisation
        if (
            resolved_str.lower().startswith(str(blocked_path).lower() + "\\")
            or resolved_str.lower() == str(blocked_path).lower()
        ):
            return True
    return False


def _reject(reason: str) -> HTTPException:
    """Build a 403 HTTPException with a clear message."""
    logger.warning("Path rejected: %s", reason)
    return HTTPException(status_code=403, detail=reason)


# ── Public API ──────────────────────────────────────────────────────────


def validate_repository_path(path: str) -> Path:
    """Validate and resolve a user-supplied repository path.

    Raises:
        HTTPException(403): If the path is blocked, contains traversal
            sequences, is outside allowed roots, or is not an existing directory.

    Returns:
        The resolved, absolute ``Path`` object.
    """
    if not path or not path.strip():
        raise _reject("Repository path must not be empty.")

    path = path.strip()

    # Block null bytes
    if "\x00" in path:
        raise _reject("Path contains null bytes.")

    # Block explicit traversal
    if ".." in path.replace("\\", "/").split("/"):
        raise _reject("Path must not contain '..' components.")

    try:
        resolved = Path(path).resolve()
    except (OSError, ValueError) as exc:
        raise _reject(f"Cannot resolve path: {exc}") from exc

    # Must be absolute after resolution
    if not resolved.is_absolute():
        raise _reject("Path must be absolute.")

    # Block system directories (defense in depth)
    if _is_under_blocked_path(resolved):
        raise _reject(f"Access to system path '{resolved}' is forbidden.")

    # Check configured allowed roots (allowlist)
    allowed_roots = [Path(r).resolve() for r in settings.allowed_roots if str(r).strip()]
    if allowed_roots:
        is_allowed = any(resolved == root or (root in resolved.parents) for root in allowed_roots)
        if not is_allowed:
            raise _reject(f"Repository path '{resolved}' is not within any allowed root.")
    else:
        # Fall back to blocklist + home directory + sensitive hidden components
        try:
            home = Path.home().resolve()
            if resolved == home:
                raise _reject("Access to user home directory is forbidden.")
        except HTTPException:
            raise
        except Exception:
            pass

        if _has_sensitive_component(resolved):
            raise _reject(f"Access to path containing sensitive component '{resolved}' is forbidden.")

    # Must exist and be a directory
    if not resolved.exists():
        raise _reject(f"Path does not exist: {resolved}")

    if not resolved.is_dir():
        raise _reject(f"Path is not a directory: {resolved}")

    logger.debug("Repository path validated: %s", resolved)
    return resolved


def validate_file_path(
    file_path: str,
    repo_root: str | None = None,
) -> Path:
    """Validate a user-supplied file path, optionally constraining it to a repo root.

    Args:
        file_path: The file path to validate.
        repo_root: If provided, the file must reside inside this directory.

    Raises:
        HTTPException(403): On any policy violation.

    Returns:
        The resolved, absolute ``Path`` object.
    """
    if not file_path or not file_path.strip():
        raise _reject("File path must not be empty.")

    file_path = file_path.strip()

    if "\x00" in file_path:
        raise _reject("File path contains null bytes.")

    if ".." in file_path.replace("\\", "/").split("/"):
        raise _reject("File path must not contain '..' components.")

    try:
        resolved = Path(file_path).resolve()
    except (OSError, ValueError) as exc:
        raise _reject(f"Cannot resolve file path: {exc}") from exc

    # Block system directories
    if _is_under_blocked_path(resolved):
        raise _reject(f"Access to system path '{resolved}' is forbidden.")

    # Block sensitive hidden components
    if _has_sensitive_file_component(Path(file_path).parts) or _has_sensitive_file_component(resolved.parts):
        raise _reject(f"Access to sensitive file or path '{file_path}' is forbidden.")

    # Constrain to repo root when given
    if repo_root is not None:
        try:
            root_resolved = Path(repo_root).resolve()
        except (OSError, ValueError) as exc:
            raise _reject(f"Cannot resolve repo root: {exc}") from exc

        try:
            resolved.relative_to(root_resolved)
        except ValueError as exc:
            raise _reject(f"File '{resolved}' is outside the repository root '{root_resolved}'.") from exc

    # Must exist and be a regular file
    if not resolved.exists():
        raise _reject(f"File does not exist: {resolved}")

    if not resolved.is_file():
        raise _reject(f"Path is not a regular file: {resolved}")

    logger.debug("File path validated: %s", resolved)
    return resolved
