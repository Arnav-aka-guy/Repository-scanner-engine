"""High-level parser service – scanning and parsing orchestration."""

from __future__ import annotations

from backend.core.models import RepositoryInfo
from backend.parser.models import ParsedFile
from backend.parser.python_parser import PythonParser
from backend.parser.typescript_parser import TypeScriptParser
from backend.parser.scanner import RepositoryScanner

# Languages that have a dedicated parser.
_PARSEABLE_LANGUAGES: set[str] = {"Python", "TypeScript", "JavaScript"}


class ParserService:
    """Async façade around the repository scanner and language parsers."""

    def __init__(self) -> None:
        self._scanner = RepositoryScanner()
        self._python_parser = PythonParser()
        self._ts_parser = TypeScriptParser()
        self._repo_cache: dict[str, RepositoryInfo] = {}
        self._parsed_cache: dict[str, dict[str, ParsedFile]] = {}

    # ── Scanning ────────────────────────────────────────────────────────

    async def scan_repository(self, repo_path: str) -> RepositoryInfo:
        """Scan *repo_path* and return repository metadata (cached)."""
        if repo_path in self._repo_cache:
            return self._repo_cache[repo_path]

        info = self._scanner.scan(repo_path)
        self._repo_cache[repo_path] = info
        return info

    # ── Parsing ─────────────────────────────────────────────────────────

    async def parse_repository(
        self,
        repo_path: str,
    ) -> dict[str, ParsedFile]:
        """Scan and parse all supported source files in *repo_path*.

        Supports Python (.py), TypeScript (.ts/.tsx), and JavaScript (.js/.jsx).
        Returns a mapping of **file path → ParsedFile**. Results are
        cached so repeated calls return immediately.
        """
        if repo_path in self._parsed_cache:
            return self._parsed_cache[repo_path]

        # Collect all files (no language filter) then parse supported ones
        all_files = self._scanner.get_files(repo_path)
        parsed: dict[str, ParsedFile] = {}

        for fi in all_files:
            if fi.language not in _PARSEABLE_LANGUAGES:
                continue

            if fi.language == "Python":
                parsed_file = self._python_parser.parse_file(fi.path)
            else:
                # TypeScript or JavaScript
                parsed_file = self._ts_parser.parse_file(fi.path)

            parsed[fi.path] = parsed_file

        self._parsed_cache[repo_path] = parsed
        return parsed

    async def parse_file(self, file_path: str) -> ParsedFile:
        """Parse a single file and return its ``ParsedFile``."""
        lang = self._scanner.detect_language(file_path)
        if lang in ("TypeScript", "JavaScript"):
            return self._ts_parser.parse_file(file_path)
        return self._python_parser.parse_file(file_path)

    # ── Cache management ────────────────────────────────────────────────

    def invalidate_cache(self, repo_path: str | None = None) -> None:
        """Clear cached results.  If *repo_path* is ``None``, flush everything."""
        if repo_path is None:
            self._repo_cache.clear()
            self._parsed_cache.clear()
        else:
            self._repo_cache.pop(repo_path, None)
            self._parsed_cache.pop(repo_path, None)

