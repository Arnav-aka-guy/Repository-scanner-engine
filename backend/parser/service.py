"""High-level parser service – scanning and parsing orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import OrderedDict
from pathlib import Path
from typing import TYPE_CHECKING

from backend.core.config import settings
from backend.core.models import RepositoryInfo
from backend.parser.manifest import (
    ManifestDiff,
    RepoManifest,
    build_manifest_diff,
    get_repo_id,
)
from backend.parser.models import ParsedFile
from backend.parser.python_parser import PythonParser
from backend.parser.scanner import RepositoryScanner
from backend.parser.typescript_parser import TypeScriptParser

if TYPE_CHECKING:
    from backend.parser.protocol import LanguageParser

logger = logging.getLogger(__name__)

# Languages that have a dedicated parser.
_PARSEABLE_LANGUAGES: set[str] = {"Python", "TypeScript", "JavaScript"}
_DEFAULT_CACHE_CAPACITY: int = 20


class ParserService:
    """Async façade around the repository scanner and language parsers."""

    def __init__(self, cache_capacity: int = _DEFAULT_CACHE_CAPACITY) -> None:
        self._scanner = RepositoryScanner()
        self._parsers: dict[str, LanguageParser] = {
            "Python": PythonParser(),
            "TypeScript": TypeScriptParser(),
            "JavaScript": TypeScriptParser(),
        }
        self._python_parser = self._parsers["Python"]
        self._ts_parser = self._parsers["TypeScript"]

        # Bounded LRU caches for repository metadata and parsed AST files
        self._cache_capacity = cache_capacity
        self._repo_cache: OrderedDict[str, RepositoryInfo] = OrderedDict()
        self._parsed_cache: OrderedDict[str, dict[str, ParsedFile]] = OrderedDict()
        self._last_diffs: dict[str, ManifestDiff] = {}

    def register_parser(self, language: str, parser: LanguageParser) -> None:
        """Register a custom parser implementing LanguageParser Protocol."""
        self._parsers[language] = parser
        _PARSEABLE_LANGUAGES.add(language)

    # ── Manifest & Cache Path Helpers ────────────────────────────────────

    def _get_manifest_path(self, repo_path: str) -> Path:
        return Path(settings.cache_dir) / get_repo_id(repo_path) / "manifest.json"

    def _get_parsed_cache_path(self, repo_path: str) -> Path:
        return Path(settings.cache_dir) / get_repo_id(repo_path) / "parsed_cache.json"

    def get_last_diff(self, repo_path: str) -> ManifestDiff | None:
        """Retrieve the change diff from the most recent parse/scan."""
        return self._last_diffs.get(repo_path)

    # ── Scanning ────────────────────────────────────────────────────────

    async def scan_repository(self, repo_path: str) -> RepositoryInfo:
        """Scan *repo_path* and return repository metadata (cached)."""
        if repo_path in self._repo_cache:
            self._repo_cache.move_to_end(repo_path)
            return self._repo_cache[repo_path]

        info = await asyncio.to_thread(self._scanner.scan, repo_path)

        if len(self._repo_cache) >= self._cache_capacity:
            self._repo_cache.popitem(last=False)
        self._repo_cache[repo_path] = info
        return info

    # ── Parsing ─────────────────────────────────────────────────────────

    async def parse_repository(
        self,
        repo_path: str,
        incremental: bool = True,
    ) -> dict[str, ParsedFile]:
        """Scan and parse all supported source files in *repo_path*.

        Supports Python (.py), TypeScript (.ts/.tsx), and JavaScript (.js/.jsx).
        Performs incremental parsing when enabled, skipping unchanged files and
        pruning deleted files.
        """
        # Collect all current files from scanner
        all_files = await asyncio.to_thread(self._scanner.get_files, repo_path)
        manifest_path = self._get_manifest_path(repo_path)

        prev_manifest = RepoManifest.load(manifest_path) if incremental else None
        new_manifest, diff = build_manifest_diff(prev_manifest, all_files, repo_path)
        self._last_diffs[repo_path] = diff

        # If incremental and in-memory cache is present and no changes exist
        if incremental and not diff.has_changes and repo_path in self._parsed_cache:
            self._parsed_cache.move_to_end(repo_path)
            return self._parsed_cache[repo_path]

        # Initialize existing parsed files state
        parsed: dict[str, ParsedFile] = {}
        if repo_path in self._parsed_cache:
            parsed = dict(self._parsed_cache[repo_path])
        elif incremental:
            disk_cache = self._get_parsed_cache_path(repo_path)
            if disk_cache.exists():
                try:
                    with open(disk_cache, encoding="utf-8") as f:
                        data = json.load(f)
                    parsed = {p: ParsedFile.model_validate(val) for p, val in data.items()}
                except Exception as exc:
                    logger.warning("Failed loading parsed cache from disk for %s: %s", repo_path, exc)

        # Drop deleted files
        for dpath in diff.deleted_files:
            parsed.pop(dpath, None)

        # Determine which files need parsing
        files_to_parse = set(diff.new_files) | set(diff.modified_files)
        for fi in all_files:
            if fi.language not in _PARSEABLE_LANGUAGES:
                continue

            fpath = str(Path(fi.path).resolve())
            # Parse if new/modified, or if missing from existing parsed state
            if fpath in files_to_parse or fpath not in parsed:
                parser = self._parsers.get(fi.language)
                if parser is None:
                    continue

                parsed_file = await asyncio.to_thread(parser.parse_file, fpath)
                parsed[fpath] = parsed_file

        # Persist updated manifest and parsed cache to disk
        new_manifest.save(manifest_path)
        disk_cache_file = self._get_parsed_cache_path(repo_path)
        disk_cache_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(disk_cache_file, "w", encoding="utf-8") as f:
                json.dump({p: pf.model_dump() for p, pf in parsed.items()}, f)
        except Exception as exc:
            logger.warning("Failed saving parsed cache for %s: %s", repo_path, exc)

        if len(self._parsed_cache) >= self._cache_capacity:
            self._parsed_cache.popitem(last=False)
        self._parsed_cache[repo_path] = parsed
        return parsed

    async def parse_file(self, file_path: str) -> ParsedFile:
        """Parse a single file and return its ``ParsedFile``."""
        lang = self._scanner.detect_language(file_path)
        parser = self._parsers.get(lang)
        if parser is not None:
            return await asyncio.to_thread(parser.parse_file, file_path)
        return await asyncio.to_thread(self._python_parser.parse_file, file_path)

    # ── Cache management ────────────────────────────────────────────────

    def invalidate_cache(self, repo_path: str | None = None, clear_manifest: bool = False) -> None:
        """Clear cached results.  If *repo_path* is ``None``, flush everything."""
        if repo_path is None:
            self._repo_cache.clear()
            self._parsed_cache.clear()
            self._last_diffs.clear()
        else:
            self._repo_cache.pop(repo_path, None)
            self._parsed_cache.pop(repo_path, None)
            self._last_diffs.pop(repo_path, None)

        if clear_manifest and repo_path:
            m_path = self._get_manifest_path(repo_path)
            c_path = self._get_parsed_cache_path(repo_path)
            if m_path.exists():
                m_path.unlink(missing_ok=True)
            if c_path.exists():
                c_path.unlink(missing_ok=True)
