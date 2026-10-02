"""Protocol defining the standard interface for source code parsers."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from backend.parser.models import ParsedFile


@runtime_checkable
class LanguageParser(Protocol):
    """Protocol for language-specific source code parsers."""

    def parse_file(self, file_path: str) -> ParsedFile:
        """Parse a source file and return its extracted structural metadata."""
        ...
