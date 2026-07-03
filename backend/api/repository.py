"""Repository scanning and file exploration endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.api.dependencies import get_embeddings, get_parser
from backend.core.models import CodeEntity, FileInfo, RepositoryInfo
from backend.parser.models import ParsedFile
from backend.security.path_validator import validate_file_path, validate_repository_path

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.embeddings.service import EmbeddingsService
    from backend.parser.service import ParserService

router = APIRouter(prefix="/api/repository", tags=["repository"])


# ── Request / Response schemas ──────────────────────────────────────────


class ScanRequest(BaseModel):
    """Body for the repository scan endpoint."""

    path: str = Field(..., description="Absolute path to the repository root")


class FileDetail(BaseModel):
    """Detailed view of a single source file including parsed entities."""

    file_path: str
    content: str
    language: str
    entities: list[CodeEntity] = Field(default_factory=list)


# ── Route handlers ──────────────────────────────────────────────────────


@router.post("/scan", response_model=RepositoryInfo)
async def scan_repository(
    body: ScanRequest,
    parser: ParserService = Depends(get_parser),
    embeddings: EmbeddingsService = Depends(get_embeddings),
) -> RepositoryInfo:
    """Scan a repository: discover files, parse them and index embeddings.

    Returns aggregate repository metadata once complete.
    """
    path = validate_repository_path(body.path)

    try:
        repo_info: RepositoryInfo = await parser.scan_repository(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan repository: {exc}",
        ) from exc

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(path))
        await _index_embeddings(embeddings, parsed_files)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Indexing failed: {exc}",
        ) from exc

    return repo_info


@router.get("/files", response_model=list[FileInfo])
async def list_files(
    repo_path: str = Query(..., description="Absolute path to the repository root"),
    parser: ParserService = Depends(get_parser),
) -> list[FileInfo]:
    """Return a flat list of all source files discovered in the repository."""
    path = validate_repository_path(repo_path)

    try:
        # Use the scanner which correctly filters .gitignore, __pycache__, node_modules, etc.
        files = parser._scanner.get_files(str(path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list files: {exc}",
        ) from exc

    return files


@router.get("/file/{file_path:path}", response_model=FileDetail)
async def get_file(
    file_path: str,
    parser: ParserService = Depends(get_parser),
) -> FileDetail:
    """Return the raw content of a single file together with its parsed entities."""
    target = validate_file_path(file_path)

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Cannot read file: {exc}"
        ) from exc

    try:
        parsed: ParsedFile = await parser.parse_file(str(target))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Parse error: {exc}"
        ) from exc

    # Entity extraction (will be moved to a service later)
    entities: list[CodeEntity] = []
    for func in parsed.functions:
        entities.append(
            CodeEntity(
                name=func.name,
                entity_type="function",
                file_path=file_path,
                start_line=func.start_line,
                end_line=func.end_line,
                docstring=func.docstring,
                source_code=func.source_code,
            )
        )
    for cls in parsed.classes:
        entities.append(
            CodeEntity(
                name=cls.name,
                entity_type="class",
                file_path=file_path,
                start_line=cls.start_line,
                end_line=cls.end_line,
                docstring=cls.docstring,
                source_code="",
            )
        )
        for method in cls.methods:
            entities.append(
                CodeEntity(
                    name=f"{cls.name}.{method.name}",
                    entity_type="method",
                    file_path=file_path,
                    start_line=method.start_line,
                    end_line=method.end_line,
                    docstring=method.docstring,
                    source_code=method.source_code,
                )
            )

    return FileDetail(
        file_path=file_path,
        content=content,
        language=parsed.language,
        entities=entities,
    )


# ── Helpers ──────────────────────────────────────────────────────────────


async def _index_embeddings(
    embeddings_service,
    parsed_files: dict[str, ParsedFile],
) -> int:
    """Index all parsed files into the embeddings store and return the count."""
    count: int = await embeddings_service.index_repository(parsed_files)
    return count
