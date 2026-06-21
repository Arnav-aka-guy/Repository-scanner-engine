"""Shared domain models used across the application."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FileInfo(BaseModel):
    """Metadata for a single source file discovered during scanning."""

    path: str
    name: str
    extension: str
    size_bytes: int
    line_count: int
    language: str


class CodeEntity(BaseModel):
    """A single code entity (class, function, or method) extracted from source."""

    name: str
    entity_type: str = Field(
        ...,
        description="Type of entity: 'class', 'function', or 'method'",
    )
    file_path: str
    start_line: int
    end_line: int
    docstring: str = ""
    source_code: str = ""


class RepositoryInfo(BaseModel):
    """Aggregate metadata about a scanned repository."""

    path: str
    name: str
    total_files: int
    total_lines: int
    languages: dict[str, int] = Field(
        default_factory=dict,
        description="Mapping of language name to file count",
    )
    scanned_at: datetime = Field(default_factory=datetime.utcnow)
