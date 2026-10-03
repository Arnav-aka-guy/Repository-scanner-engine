"""Registry of repository roots scanned through the application.

Maintains an in-memory and persistent on-disk record under data/ of all repositories
that have undergone scanning via the engine.
"""

from __future__ import annotations

import contextlib
import json
import logging
from pathlib import Path

from backend.core.config import settings

logger = logging.getLogger(__name__)

_scanned_repos: set[str] = set()


def _get_registry_path() -> Path:
    data_dir = Path(settings.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "scanned_repos.json"


def load_scanned_repos() -> set[str]:
    """Load scanned repositories from persistent storage."""
    global _scanned_repos
    reg_path = _get_registry_path()
    if reg_path.exists():
        try:
            data = json.loads(reg_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                _scanned_repos = {str(Path(p).resolve()) for p in data}
        except Exception as exc:
            logger.warning("Failed to load scanned repositories registry: %s", exc)
    return _scanned_repos


def register_scanned_repo(repo_path: str | Path) -> None:
    """Record a repository root as scanned and persist the registry to disk."""
    global _scanned_repos
    try:
        resolved_str = str(Path(repo_path).resolve())
    except (OSError, ValueError):
        resolved_str = str(repo_path)

    _scanned_repos.add(resolved_str)
    reg_path = _get_registry_path()
    try:
        reg_path.write_text(json.dumps(sorted(_scanned_repos), indent=2), encoding="utf-8")
        logger.debug("Registered scanned repository: %s", resolved_str)
    except Exception as exc:
        logger.error("Failed to persist scanned repository registry: %s", exc)


def is_repo_scanned(repo_path: str | Path) -> bool:
    """Check if a repository root has been scanned through the app."""
    try:
        resolved_str = str(Path(repo_path).resolve())
    except (OSError, ValueError):
        resolved_str = str(repo_path)

    if resolved_str in _scanned_repos:
        return True
    # Re-check disk in case another worker process or earlier run persisted it
    load_scanned_repos()
    return resolved_str in _scanned_repos


def clear_scanned_repos() -> None:
    """Clear scanned repo registry (useful for testing)."""
    global _scanned_repos
    _scanned_repos.clear()
    reg_path = _get_registry_path()
    if reg_path.exists():
        with contextlib.suppress(OSError):
            reg_path.unlink()


# Initial load on import
with contextlib.suppress(Exception):
    load_scanned_repos()
