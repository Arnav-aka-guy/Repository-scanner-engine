"""Repository scanning and file exploration endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.models import CodeEntity, FileInfo, RepositoryInfo
from backend.parser.models import ParsedFile

router = APIRouter(prefix="/api/repository", tags=["repository"])


# ── Lazy service singletons ─────────────────────────────────────────────

_parser_service = None


def get_parser_service():
    """Return a lazily-initialised ParserService singleton."""
    global _parser_service  # noqa: PLW0603
    if _parser_service is None:
        from backend.parser.service import ParserService

        _parser_service = ParserService()
    return _parser_service



def get_embeddings_service():
    """Return the global EmbeddingsService singleton from the DI container."""
    from backend.core.container import get_container
    return get_container().embeddings_service


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
async def scan_repository(body: ScanRequest) -> RepositoryInfo:
    """Scan a repository: discover files, parse them and index embeddings.

    Returns aggregate repository metadata once complete.
    """
    repo_path = Path(body.path)
    if not repo_path.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is not a directory: {body.path}",
        )

    parser = get_parser_service()
    embeddings = get_embeddings_service()

    try:
        repo_info: RepositoryInfo = await parser.scan_repository(str(repo_path))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan repository: {exc}",
        ) from exc

    try:
        parsed_files: dict[str, ParsedFile] = await parser.parse_repository(str(repo_path))
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
) -> list[FileInfo]:
    """Return a flat list of all source files discovered in the repository."""
    path = Path(repo_path)
    if not path.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is not a directory: {repo_path}",
        )

    parser = get_parser_service()

    try:
        # Use the scanner which correctly filters .gitignore, __pycache__, node_modules, etc.
        files = parser._scanner.get_files(repo_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list files: {exc}",
        ) from exc

    return files



@router.get("/file/{file_path:path}", response_model=FileDetail)
async def get_file(file_path: str) -> FileDetail:
    """Return the raw content of a single file together with its parsed entities."""
    target = Path(file_path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Cannot read file: {exc}"
        ) from exc

    parser = get_parser_service()

    try:
        parsed: ParsedFile = await parser.parse_file(file_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Parse error: {exc}"
        ) from exc

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

_EXTENSION_LANGUAGE_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "JavaScript",
    ".tsx": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C",
    ".hpp": "C++",
    ".cs": "C#",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".scala": "Scala",
    ".php": "PHP",
    ".r": "R",
    ".sql": "SQL",
    ".sh": "Shell",
    ".md": "Markdown",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".html": "HTML",
    ".css": "CSS",
}


def _detect_language(extension: str) -> str:
    """Map a file extension to a human-readable language name."""
    return _EXTENSION_LANGUAGE_MAP.get(extension.lower(), "Unknown")


async def _index_embeddings(
    embeddings_service,
    parsed_files: dict[str, ParsedFile],
) -> int:
    """Index all parsed files into the embeddings store and return the count."""
    count: int = await embeddings_service.index_repository(parsed_files)
    return count
