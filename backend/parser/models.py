"""Pydantic models for parsed source code structures."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImportInfo(BaseModel):
    """A single import statement."""

    module: str
    names: list[str] = Field(default_factory=list)
    is_from_import: bool = False
    alias: str | None = None


class FunctionInfo(BaseModel):
    """Extracted metadata for a function or method."""

    name: str
    args: list[str] = Field(default_factory=list)
    return_type: str | None = None
    decorators: list[str] = Field(default_factory=list)
    docstring: str = ""
    source_code: str = ""
    start_line: int = 0
    end_line: int = 0
    calls: list[str] = Field(
        default_factory=list,
        description="Names of functions/methods called within this function body",
    )


class ClassInfo(BaseModel):
    """Extracted metadata for a class definition."""

    name: str
    bases: list[str] = Field(default_factory=list)
    decorators: list[str] = Field(default_factory=list)
    docstring: str = ""
    source_code: str = ""
    methods: list[FunctionInfo] = Field(default_factory=list)
    attributes: list[str] = Field(default_factory=list)
    start_line: int = 0
    end_line: int = 0


class ParsedFile(BaseModel):
    """Complete parse result for a single source file."""

    file_path: str
    language: str = "Python"
    imports: list[ImportInfo] = Field(default_factory=list)
    functions: list[FunctionInfo] = Field(default_factory=list)
    classes: list[ClassInfo] = Field(default_factory=list)
    module_docstring: str = ""
