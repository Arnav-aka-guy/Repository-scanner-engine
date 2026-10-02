"""Service for safely cloning and scanning public GitHub repositories.

Validates URLs against strict HTTPS GitHub patterns, prevents shell injection,
uses shallow clones with depth 1, and enforces timeout and resource bounds.
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException

from backend.core.config import settings

logger = logging.getLogger(__name__)

# Strict regex matching standard public GitHub repository HTTPS URLs
_GITHUB_URL_REGEX = re.compile(
    r"^https://github\.com/(?P<owner>[a-zA-Z0-9_.-]+)/(?P<repo>[a-zA-Z0-9_.-]+?)(?:\.git)?/?$"
)


def validate_github_url(url: str) -> tuple[str, str, str]:
    """Validate a GitHub repository URL and return normalized URL, owner, and repo name.

    Raises:
        HTTPException: If the URL is invalid or uses an insecure protocol.
    """
    clean_url = url.strip()
    match = _GITHUB_URL_REGEX.match(clean_url)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. Must be in the format 'https://github.com/owner/repo'.",
        )

    owner = match.group("owner")
    repo = match.group("repo")
    normalized_url = f"https://github.com/{owner}/{repo}.git"
    return normalized_url, owner, repo


def clone_github_repo(
    url: str,
    target_parent_dir: Path | None = None,
    timeout_seconds: int = 90,
) -> Path:
    """Clone a public GitHub repository using a shallow clone into a safe isolated folder.

    Args:
        url: Validated GitHub URL.
        target_parent_dir: Destination folder. Defaults to ``data/cloned_repos``.
        timeout_seconds: Execution timeout for the git clone command.

    Returns:
        Absolute Path to the cloned repository.

    Raises:
        HTTPException: If cloning fails, times out, or git is not available.
    """
    normalized_url, owner, repo = validate_github_url(url)

    parent_dir = target_parent_dir or (Path(settings.data_dir) / "cloned_repos")
    parent_dir.mkdir(parents=True, exist_ok=True)

    url_hash = hashlib.sha256(normalized_url.encode("utf-8")).hexdigest()[:8]
    clean_repo_name = f"{owner}_{repo}_{url_hash}"
    target_dir = (parent_dir / clean_repo_name).resolve()

    # If repo directory already exists from previous clone, remove it first for fresh state
    if target_dir.exists():
        try:
            shutil.rmtree(target_dir, ignore_errors=True)
        except OSError as exc:
            logger.warning("Failed cleaning existing clone at %s: %s", target_dir, exc)

    cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--",
        normalized_url,
        str(target_dir),
    ]

    logger.info("Cloning public repository %s into %s ...", normalized_url, target_dir)
    try:
        # shell=False is strictly enforced to prevent command injection
        result = subprocess.run(  # noqa: S603
            cmd,
            shell=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if result.returncode != 0:
            logger.error("Git clone failed (code %d): %s", result.returncode, result.stderr)
            raise HTTPException(
                status_code=400,
                detail="Failed to clone GitHub repository. Ensure repository is public and accessible.",
            )
    except subprocess.TimeoutExpired as exc:
        logger.error("Git clone timed out after %ds for %s", timeout_seconds, normalized_url)
        # Cleanup partial clone
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(
            status_code=408,
            detail="Repository clone timed out.",
        ) from exc
    except FileNotFoundError as exc:
        logger.error("git executable not found in PATH")
        raise HTTPException(
            status_code=500,
            detail="Git executable is not installed or available on server.",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error during git clone: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Repository cloning encountered an unexpected error.",
        ) from exc

    return target_dir
