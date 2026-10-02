"""Repository file scanner with .gitignore support and resource limits.

Resource limits (MAX_FILES, MAX_FILE_SIZE, MAX_DIRECTORY_DEPTH) are
enforced during traversal so that oversized repositories are rejected
early rather than consuming unbounded memory or CPU.
"""

from __future__ import annotations

import fnmatch
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

from backend.core.models import FileInfo, RepositoryInfo

logger = logging.getLogger(__name__)

# ── Language detection ──────────────────────────────────────────────────
_EXTENSION_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".kt": "Kotlin",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".hpp": "C++",
    ".cs": "C#",
    ".swift": "Swift",
    ".scala": "Scala",
    ".r": "R",
    ".R": "R",
    ".lua": "Lua",
    ".sh": "Shell",
    ".bash": "Shell",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "SASS",
    ".json": "JSON",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".md": "Markdown",
    ".toml": "TOML",
}

_SKIP_DIRS: set[str] = {
    ".git",
    "__pycache__",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
    ".idea",
    ".vscode",
    ".mypy_cache",
    ".pytest_cache",
    ".tox",
    "dist",
    "build",
    "egg-info",
}


class ScanLimitError(Exception):
    """Raised when a repository exceeds configured scanning limits.

    Attributes:
        code: Machine-readable error code for API consumers.
    """

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class RepositoryScanner:
    """Walk a repository tree and collect file metadata.

    Resource limits are read from the application settings on each call
    so that reconfiguration (e.g. in tests) is respected immediately.
    """

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def detect_language(file_path: str) -> str:
        """Return the programming language for *file_path* based on extension."""
        ext = os.path.splitext(file_path)[1].lower()
        return _EXTENSION_MAP.get(ext, "Unknown")

    @staticmethod
    def _load_gitignore_patterns(repo_path: str) -> list[str]:
        """Read .gitignore at *repo_path* and return a list of glob patterns."""
        gitignore = os.path.join(repo_path, ".gitignore")
        if not os.path.isfile(gitignore):
            return []
        patterns: list[str] = []
        with open(gitignore, encoding="utf-8", errors="ignore") as fh:
            for raw in fh:
                line = raw.strip()
                if line and not line.startswith("#"):
                    patterns.append(line)
        return patterns

    @staticmethod
    def _is_ignored(rel_path: str, patterns: list[str]) -> bool:
        """Return True if *rel_path* matches any .gitignore pattern."""
        for pattern in patterns:
            if fnmatch.fnmatch(rel_path, pattern):
                return True
            if fnmatch.fnmatch(os.path.basename(rel_path), pattern):
                return True
            # Handle directory patterns (e.g. "build/")
            if pattern.endswith("/") and fnmatch.fnmatch(rel_path, pattern.rstrip("/") + "/*"):
                return True
        return False

    @staticmethod
    def _count_lines(file_path: str) -> int:
        """Count the number of lines in a text file."""
        try:
            with open(file_path, encoding="utf-8", errors="ignore") as fh:
                return sum(1 for _ in fh)
        except (OSError, UnicodeDecodeError):
            return 0

    @staticmethod
    def _is_binary(file_path: str) -> bool:
        """Heuristic binary-file detection: read first 8 kB and check for NUL bytes."""
        try:
            with open(file_path, "rb") as fh:
                chunk = fh.read(8192)
            return b"\x00" in chunk
        except OSError:
            return False

    # ── Public API ──────────────────────────────────────────────────────

    def _collect_files(
        self,
        repo_path: str,
        language: str | None = None,
        max_files: int = 10_000,
        max_file_size: int = 5 * 1024 * 1024,
        max_depth: int = 30,
    ) -> list[FileInfo]:
        """Walk *repo_path* and return a list of ``FileInfo`` objects.

        Args:
            repo_path: Absolute path to the repository root.
            language: Optional language filter.
            max_files: Maximum number of files to collect before aborting.
            max_file_size: Maximum individual file size in bytes.
            max_depth: Maximum directory nesting depth to traverse.

        Raises:
            ScanLimitError: When a resource limit is exceeded.
        """
        repo = Path(repo_path).resolve()
        patterns = self._load_gitignore_patterns(str(repo))
        files: list[FileInfo] = []

        for dirpath, dirnames, filenames in os.walk(repo, topdown=True):
            # Compute current depth relative to repo root
            try:
                rel_parts = Path(dirpath).resolve().relative_to(repo).parts
                depth = len(rel_parts)
            except ValueError:
                depth = 0

            if depth > max_depth:
                # Stop descending into this branch
                dirnames.clear()
                logger.warning(
                    "Max directory depth (%d) exceeded at %s — not descending further.",
                    max_depth,
                    dirpath,
                )
                continue

            # Prune hidden and blacklisted directories in-place
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in _SKIP_DIRS]

            for fname in filenames:
                full = os.path.join(dirpath, fname)
                rel = os.path.relpath(full, repo)

                if self._is_ignored(rel, patterns):
                    continue

                lang = self.detect_language(full)
                if lang == "Unknown":
                    continue
                if language and lang != language:
                    continue

                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0

                if size > max_file_size:
                    logger.warning(
                        "Skipping %s: file size %d bytes exceeds limit %d bytes.",
                        rel,
                        size,
                        max_file_size,
                    )
                    continue

                # Skip binary files even if they have a known extension
                if self._is_binary(full):
                    logger.debug("Skipping binary file: %s", rel)
                    continue

                files.append(
                    FileInfo(
                        path=full,
                        name=fname,
                        extension=os.path.splitext(fname)[1],
                        size_bytes=size,
                        line_count=self._count_lines(full),
                        language=lang,
                    )
                )

                if len(files) > max_files:
                    raise ScanLimitError(
                        f"Repository exceeds the maximum file limit of {max_files} files. "
                        "Consider increasing MAX_FILES in the configuration or scanning a subdirectory.",
                        code="repository_too_large",
                    )

        return files

    def scan(self, repo_path: str) -> RepositoryInfo:
        """Scan *repo_path* and return aggregate repository metadata.

        Resource limits are read from the application settings so they
        remain configurable without restarting.
        """
        from backend.core.config import get_settings

        settings = get_settings()
        files = self._collect_files(
            repo_path,
            max_files=settings.max_files,
            max_file_size=settings.max_file_size_bytes,
            max_depth=settings.max_directory_depth,
        )
        languages: dict[str, int] = {}
        total_lines = 0

        for fi in files:
            languages[fi.language] = languages.get(fi.language, 0) + 1
            total_lines += fi.line_count

        return RepositoryInfo(
            path=str(Path(repo_path).resolve()),
            name=Path(repo_path).resolve().name,
            total_files=len(files),
            total_lines=total_lines,
            languages=languages,
            scanned_at=datetime.now(tz=UTC),
        )

    def get_files(
        self,
        repo_path: str,
        language: str | None = None,
    ) -> list[FileInfo]:
        """Return a (possibly filtered-by-language) list of files.

        Resource limits are applied via the application settings.
        """
        from backend.core.config import get_settings

        settings = get_settings()
        return self._collect_files(
            repo_path,
            language=language,
            max_files=settings.max_files,
            max_file_size=settings.max_file_size_bytes,
            max_depth=settings.max_directory_depth,
        )
