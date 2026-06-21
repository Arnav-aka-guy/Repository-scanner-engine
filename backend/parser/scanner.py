"""Repository file scanner with .gitignore support."""

from __future__ import annotations

import fnmatch
import os
from datetime import datetime
from pathlib import Path

from backend.core.models import FileInfo, RepositoryInfo

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


class RepositoryScanner:
    """Walk a repository tree and collect file metadata."""

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
            if pattern.endswith("/") and fnmatch.fnmatch(
                rel_path, pattern.rstrip("/") + "/*"
            ):
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

    # ── Public API ──────────────────────────────────────────────────────

    def _collect_files(
        self,
        repo_path: str,
        language: str | None = None,
    ) -> list[FileInfo]:
        """Walk *repo_path* and return a list of `FileInfo` objects."""
        repo = Path(repo_path).resolve()
        patterns = self._load_gitignore_patterns(str(repo))
        files: list[FileInfo] = []

        for dirpath, dirnames, filenames in os.walk(repo, topdown=True):
            # Prune hidden and blacklisted directories in-place
            dirnames[:] = [
                d
                for d in dirnames
                if not d.startswith(".") and d not in _SKIP_DIRS
            ]

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

        return files

    def scan(self, repo_path: str) -> RepositoryInfo:
        """Scan *repo_path* and return aggregate repository metadata."""
        files = self._collect_files(repo_path)
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
            scanned_at=datetime.utcnow(),
        )

    def get_files(
        self,
        repo_path: str,
        language: str | None = None,
    ) -> list[FileInfo]:
        """Return a (possibly filtered-by-language) list of files."""
        return self._collect_files(repo_path, language=language)
