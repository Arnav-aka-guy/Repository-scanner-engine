"""Embeddings service for indexing and searching codebase repositories."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from backend.core.config import settings
from backend.embeddings.encoder import EmbeddingEncoder
from backend.embeddings.store import VectorStore

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


class EmbeddingsService:
    """Orchestrates code parsing results into vector database and searches it."""

    def __init__(self, model_name: str | None = None) -> None:
        model = model_name or settings.embedding_model
        self.encoder = EmbeddingEncoder(model)
        self.store = VectorStore(self.encoder.dimension)

    async def index_repository(self, parsed_files: dict[str, ParsedFile]) -> int:
        """Create text chunks from parsed repository code, compute embeddings, and store them.

        Args:
            parsed_files: Dictionary of file paths to ParsedFile objects.

        Returns:
            The number of indexed code chunks.
        """
        self.store.clear()
        texts, metadata = self._create_chunks(parsed_files)

        if not texts:
            logger.warning("No code entities found to index in the repository.")
            return 0

        logger.info("Computing embeddings for %d code chunks ...", len(texts))
        # Batch encode
        embeddings = self.encoder.encode(texts)

        # Add to FAISS vector store
        self.store.add(embeddings, metadata)
        return len(texts)

    async def search(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Search the indexed repository for relevant code entities matching the query.

        Args:
            query: The natural language search query.
            top_k: Number of results to return.

        Returns:
            List of search results containing "score" and "metadata".
        """
        if len(self.store) == 0:
            logger.warning("Search failed: Vector store is empty.")
            return []

        logger.info("Performing semantic search for: '%s'", query)
        query_embedding = self.encoder.encode_single(query)
        return self.store.search(query_embedding, top_k=top_k)

    async def save_index(self, repo_name: str) -> None:
        """Save vector database index and metadata to the cache directory.

        Args:
            repo_name: The name/identifier of the repository.
        """
        save_dir = Path(settings.embeddings_dir) / repo_name
        save_dir.mkdir(parents=True, exist_ok=True)
        base_path = save_dir / "index"
        self.store.save(base_path)

    async def load_index(self, repo_name: str) -> bool:
        """Load vector database index and metadata from the cache directory.

        Args:
            repo_name: The name/identifier of the repository.

        Returns:
            True if loaded successfully, False otherwise.
        """
        load_path = Path(settings.embeddings_dir) / repo_name / "index"
        try:
            self.store.load(load_path)
            return True
        except FileNotFoundError:
            logger.warning("No saved vector index found at %s", load_path)
            return False
        except Exception as e:
            logger.error("Failed to load vector store from %s: %s", load_path, e)
            return False

    def _create_chunks(self, parsed_files: dict[str, ParsedFile]) -> tuple[list[str], list[dict[str, Any]]]:
        """Convert parsed repository structure into search-friendly text chunks and metadata."""
        texts: list[str] = []
        metadata: list[dict[str, Any]] = []

        for file_path, parsed in parsed_files.items():
            # 1. Module chunk
            mod_doc = parsed.module_docstring or ""
            module_text = f"Module: {file_path}\nLanguage: {parsed.language}\nDocstring: {mod_doc}"
            texts.append(module_text)
            metadata.append({
                "file_path": file_path,
                "entity_name": file_path,
                "entity_type": "module",
                "start_line": 1,
                "end_line": 1,
                "source_code": "",
                "docstring": mod_doc,
            })

            # 2. Classes chunks
            for cls in parsed.classes:
                methods_str = ", ".join(m.name for m in cls.methods) if cls.methods else "none"
                class_text = (
                    f"Class: {cls.name}\n"
                    f"File: {file_path}\n"
                    f"Bases: {', '.join(cls.bases)}\n"
                    f"Docstring: {cls.docstring or ''}\n"
                    f"Methods: {methods_str}\n"
                    f"Source Code:\n{cls.source_code}"
                )
                texts.append(class_text)
                metadata.append({
                    "file_path": file_path,
                    "entity_name": cls.name,
                    "entity_type": "class",
                    "start_line": cls.start_line,
                    "end_line": cls.end_line,
                    "source_code": cls.source_code,
                    "docstring": cls.docstring or "",
                })

                # 3. Method chunks (inside classes)
                for method in cls.methods:
                    method_text = (
                        f"Method: {cls.name}.{method.name}\n"
                        f"File: {file_path}\n"
                        f"Arguments: {', '.join(method.args)}\n"
                        f"Docstring: {method.docstring or ''}\n"
                        f"Source Code:\n{method.source_code}"
                    )
                    texts.append(method_text)
                    metadata.append({
                        "file_path": file_path,
                        "entity_name": f"{cls.name}.{method.name}",
                        "entity_type": "method",
                        "start_line": method.start_line,
                        "end_line": method.end_line,
                        "source_code": method.source_code,
                        "docstring": method.docstring or "",
                    })

            # 4. Standalone function chunks
            for func in parsed.functions:
                func_text = (
                    f"Function: {func.name}\n"
                    f"File: {file_path}\n"
                    f"Arguments: {', '.join(func.args)}\n"
                    f"Docstring: {func.docstring or ''}\n"
                    f"Source Code:\n{func.source_code}"
                )
                texts.append(func_text)
                metadata.append({
                    "file_path": file_path,
                    "entity_name": func.name,
                    "entity_type": "function",
                    "start_line": func.start_line,
                    "end_line": func.end_line,
                    "source_code": func.source_code,
                    "docstring": func.docstring or "",
                })

        return texts, metadata
