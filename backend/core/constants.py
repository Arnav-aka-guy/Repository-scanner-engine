"""Application-wide security and sizing constants.

Centralises hard limits so they can be imported by validators,
middleware, and API routes without circular dependencies.
"""

from __future__ import annotations

# ── File / directory size limits ────────────────────────────────────────
MAX_FILE_SIZE: int = 5 * 1024 * 1024  # 5 MB
MAX_FILES: int = 10_000
MAX_DIRECTORY_DEPTH: int = 30

# ── Input length limits ────────────────────────────────────────────────
MAX_REPO_PATH_LENGTH: int = 500
MAX_QUERY_LENGTH: int = 2_000
MAX_CHAT_MESSAGE_LENGTH: int = 5_000

# ── Blocked system paths (always rejected by path validators) ──────────
BLOCKED_PATHS_UNIX: frozenset[str] = frozenset(
    {
        "/etc",
        "/root",
        "/var",
        "/usr",
        "/bin",
        "/sbin",
        "/sys",
        "/proc",
        "/boot",
        "/dev",
    }
)

BLOCKED_PATHS_WINDOWS: frozenset[str] = frozenset(
    {
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\ProgramData",
    }
)
