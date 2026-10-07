"""Embeddings service for indexing and searching codebase repositories.

Supports multiple isolated repositories, automated index persistence (save/load),
incremental re-indexing, and cache management.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from backend.core.config import settings
from backend.embeddings.encoder import EmbeddingEncoder
from backend.embeddings.keyword_search import KeywordSearcher
from backend.embeddings.reranker import SearchReranker
from backend.embeddings.store import VectorStore

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile

logger = logging.getLogger(__name__)


class EmbeddingsService:
    """Orchestrates code parsing results into vector database and searches it."""

    def __init__(self, model_name: str | None = None) -> None:
        model = model_name or settings.embedding_model
        self.encoder = EmbeddingEncoder(model)
        # Primary / fallback active vector store
        self.store = VectorStore(self.encoder.dimension)
        # Isolated per-repository vector stores keyed by repo path / identifier
        self._stores: dict[str, VectorStore] = {}
        # Keyword searchers keyed by repo path / identifier
        self.keyword_searcher = KeywordSearcher()
        self._keyword_searchers: dict[str, KeywordSearcher] = {}
        # Hybrid reranker
        self.reranker = SearchReranker()
        # Per-repo chunk embeddings cache: repo_id -> {file_path: (texts, metadata, embs)}
        self._file_embeddings_cache: dict[str, dict[str, tuple[list[str], list[dict[str, Any]], np.ndarray]]] = {}

    def _get_repo_id(self, repo_path: str) -> str:
        """Derive a safe filesystem folder identifier from a repository path."""
        p = Path(repo_path).resolve()
        name = p.name or "repo"
        # Combine folder name with sha256 prefix of full path for global uniqueness
        path_hash = hashlib.sha256(str(p).encode("utf-8")).hexdigest()[:8]
        return f"{name}_{path_hash}"

    def get_store(self, repo_path: str | None = None) -> VectorStore:
        """Get or lazily load the VectorStore for a given repository."""
        if not repo_path:
            return self.store

        norm_path = str(Path(repo_path).resolve())
        if norm_path not in self._stores:
            store = VectorStore(self.encoder.dimension)
            repo_id = self._get_repo_id(norm_path)
            # Try to load existing persisted index if available on disk
            load_path = Path(settings.embeddings_dir) / repo_id / "index"
            try:
                store.load(load_path)
                logger.info("Loaded persisted vector index for repo %s (%d vectors)", repo_id, len(store))
                if store.metadata and norm_path in self._keyword_searchers:
                    self._keyword_searchers[norm_path].index_documents(store.metadata)
            except (FileNotFoundError, Exception):
                logger.debug("No existing vector index for repo %s to load.", repo_id)
            self._stores[norm_path] = store
        return self._stores[norm_path]

    def get_keyword_searcher(self, repo_path: str | None = None) -> KeywordSearcher:
        """Get or lazily populate the KeywordSearcher for a given repository."""
        if not repo_path:
            return self.keyword_searcher

        norm_path = str(Path(repo_path).resolve())
        if norm_path not in self._keyword_searchers:
            kw = KeywordSearcher()
            store = self.get_store(repo_path)
            if store.metadata:
                kw.index_documents(store.metadata)
            self._keyword_searchers[norm_path] = kw
        return self._keyword_searchers[norm_path]

    async def index_repository(
        self,
        parsed_files: dict[str, ParsedFile],
        repo_path: str | None = None,
        force_reindex: bool = False,
    ) -> int:
        """Create text chunks from parsed repository code, compute embeddings, and store them.

        Supports incremental indexing: unchanged files reuse cached chunk embeddings,
        avoiding unnecessary recomputation.

        Args:
            parsed_files: Dictionary of file paths to ParsedFile objects.
            repo_path: Optional repository path for per-repo store isolation and persistence.
            force_reindex: If True, bypass cache and recompute all embeddings.

        Returns:
            The number of indexed code chunks.
        """
        parsed_files = {str(Path(p).resolve()): pf for p, pf in parsed_files.items()}
        store = self.get_store(repo_path)
        repo_id = self._get_repo_id(repo_path) if repo_path else "default"
        file_cache = self._file_embeddings_cache.setdefault(repo_id, {})

        if force_reindex:
            file_cache.clear()

        # Prune deleted files from file_cache
        for cached_fpath in list(file_cache.keys()):
            if cached_fpath not in parsed_files:
                file_cache.pop(cached_fpath, None)

        all_texts: list[str] = []
        all_metadata: list[dict[str, Any]] = []
        embs_list: list[np.ndarray] = []

        files_to_encode: list[str] = []
        for fpath in parsed_files:
            if fpath not in file_cache:
                files_to_encode.append(fpath)

        # Collect chunks across all new/modified files to batch encode efficiently
        file_chunks: dict[str, tuple[list[str], list[dict[str, Any]]]] = {}
        all_new_texts: list[str] = []
        file_slices: dict[str, tuple[int, int]] = {}

        for fpath in files_to_encode:
            parsed = parsed_files[fpath]
            texts, metadata = self._create_chunks_for_file(fpath, parsed)
            start_idx = len(all_new_texts)
            all_new_texts.extend(texts)
            end_idx = len(all_new_texts)
            file_chunks[fpath] = (texts, metadata)
            file_slices[fpath] = (start_idx, end_idx)

        all_embs = (
            await asyncio.to_thread(self.encoder.encode, all_new_texts)
            if all_new_texts
            else np.empty((0, store.dimension), dtype=np.float32)
        )

        for fpath, (texts, metadata) in file_chunks.items():
            start_idx, end_idx = file_slices[fpath]
            f_embs = (
                all_embs[start_idx:end_idx] if end_idx > start_idx else np.empty((0, store.dimension), dtype=np.float32)
            )
            file_cache[fpath] = (texts, metadata, f_embs)

        # Aggregate across all active repository files
        for _fpath, (texts, metadata, embs) in file_cache.items():
            all_texts.extend(texts)
            all_metadata.extend(metadata)
            if len(embs) > 0:
                embs_list.append(embs)

        store.clear()
        if embs_list:
            combined_embs = np.vstack(embs_list)
            store.add(combined_embs, all_metadata)

        # Build / sync BM25 keyword index for sparse search
        kw = self.get_keyword_searcher(repo_path)
        kw.index_documents(all_metadata)

        # Mirror into default store as active repository
        if store is not self.store:
            self.store = store
            self.keyword_searcher = kw

        # Automatically persist the index to disk
        if repo_path:
            try:
                await self.save_index(repo_id, repo_path=repo_path)
            except Exception as exc:
                logger.error("Failed to auto-persist vector index for %s: %s", repo_id, exc)

        return len(all_texts)

    async def search(
        self,
        query: str,
        top_k: int = 10,
        repo_path: str | None = None,
    ) -> list[dict[str, Any]]:
        """Search the indexed repository using hybrid search (Vector + BM25 Keyword + RRF).

        Args:
            query: The natural language search query.
            top_k: Number of results to return.
            repo_path: Optional repo path for isolated repository search.

        Returns:
            List of search results containing "score", "match_type", "match_reasons", and "metadata".
        """
        store = self.get_store(repo_path)
        kw_searcher = self.get_keyword_searcher(repo_path)

        if len(store) == 0 and not kw_searcher.documents:
            logger.warning("Search failed: Vector store and keyword index are empty.")
            return []

        logger.info("Performing hybrid search for: '%s'", query)

        # 1. Dense vector semantic search (FAISS)
        vector_results: list[dict[str, Any]] = []
        if len(store) > 0:
            query_embedding = await asyncio.to_thread(self.encoder.encode_single, query)
            vector_results = store.search(query_embedding, top_k=top_k * 2)

        # 2. Sparse keyword retrieval (BM25)
        keyword_results = kw_searcher.search(query, top_k=top_k * 2)

        # 3. Reciprocal Rank Fusion (RRF)
        if vector_results and keyword_results:
            return self.reranker.rerank(vector_results, keyword_results, top_k=top_k)
        elif vector_results:
            results = []
            for r in vector_results[:top_k]:
                item = dict(r)
                meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else item
                item["match_type"] = "semantic"
                item["match_reasons"] = ["semantic similarity"]
                item["metadata"] = meta
                item["file_path"] = meta.get("file_path", "")
                item["entity_name"] = meta.get("entity_name", "")
                item["entity_type"] = meta.get("entity_type", "")
                item["start_line"] = int(meta.get("start_line", 0))
                item["end_line"] = int(meta.get("end_line", 0))
                item["source_code"] = meta.get("source_code", "")
                item["docstring"] = meta.get("docstring", "")
                results.append(item)
            return results
        elif keyword_results:
            results = []
            for r in keyword_results[:top_k]:
                item = {
                    "score": min(float(r.get("keyword_score", 0.0)) / 10.0, 1.0),
                    "metadata": r,
                    "match_type": "keyword",
                    "match_reasons": ["keyword match"],
                    "keyword_score": r.get("keyword_score", 0.0),
                    "file_path": r.get("file_path", ""),
                    "entity_name": r.get("entity_name", ""),
                    "entity_type": r.get("entity_type", ""),
                    "start_line": int(r.get("start_line", 0)),
                    "end_line": int(r.get("end_line", 0)),
                    "source_code": r.get("source_code", ""),
                    "docstring": r.get("docstring", ""),
                }
                results.append(item)
            return results

        return []

    async def save_index(self, repo_name: str, repo_path: str | None = None) -> None:
        """Save vector database index and metadata to the cache directory.

        Args:
            repo_name: The name/identifier of the repository.
            repo_path: Optional repository root path to locate the isolated store.
        """
        store = self.get_store(repo_path)
        save_dir = Path(settings.embeddings_dir) / repo_name
        save_dir.mkdir(parents=True, exist_ok=True)
        base_path = save_dir / "index"
        store.save(base_path)

    async def load_index(self, repo_name: str, repo_path: str | None = None) -> None:
        """Load vector database index and metadata from the cache directory.

        Args:
            repo_name: The name/identifier of the repository.
            repo_path: Optional repository root path to bind the isolated store.
        """
        store = self.get_store(repo_path)
        load_path = Path(settings.embeddings_dir) / repo_name / "index"
        store.load(load_path)

        if store.metadata:
            kw = self.get_keyword_searcher(repo_path)
            kw.index_documents(store.metadata)
            if store is self.store:
                self.keyword_searcher = kw

        if store is not self.store:
            self.store = store

    def invalidate_repo(self, repo_path: str, clear_cache: bool = False) -> None:
        """Evict the cached VectorStore and KeywordSearcher for a repository from memory."""
        norm_path = str(Path(repo_path).resolve())
        self._stores.pop(norm_path, None)
        self._keyword_searchers.pop(norm_path, None)
        if clear_cache:
            repo_id = self._get_repo_id(norm_path)
            self._file_embeddings_cache.pop(repo_id, None)

    def _create_chunks_for_file(self, file_path: str, parsed: ParsedFile) -> tuple[list[str], list[dict[str, Any]]]:
        """Convert a single parsed file into search-friendly text chunks and metadata."""
        texts: list[str] = []
        metadata: list[dict[str, Any]] = []

        # 1. Module chunk
        mod_doc = parsed.module_docstring or ""
        module_text = f"Module: {file_path}\nLanguage: {parsed.language}\nDocstring: {mod_doc}"
        texts.append(module_text)
        metadata.append(
            {
                "file_path": file_path,
                "entity_name": file_path,
                "entity_type": "module",
                "start_line": 1,
                "end_line": 1,
                "source_code": "",
                "docstring": mod_doc,
            }
        )

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
            metadata.append(
                {
                    "file_path": file_path,
                    "entity_name": cls.name,
                    "entity_type": "class",
                    "start_line": cls.start_line,
                    "end_line": cls.end_line,
                    "source_code": cls.source_code,
                    "docstring": cls.docstring or "",
                }
            )

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
                metadata.append(
                    {
                        "file_path": file_path,
                        "entity_name": f"{cls.name}.{method.name}",
                        "entity_type": "method",
                        "start_line": method.start_line,
                        "end_line": method.end_line,
                        "source_code": method.source_code,
                        "docstring": method.docstring or "",
                    }
                )

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
            metadata.append(
                {
                    "file_path": file_path,
                    "entity_name": func.name,
                    "entity_type": "function",
                    "start_line": func.start_line,
                    "end_line": func.end_line,
                    "source_code": func.source_code,
                    "docstring": func.docstring or "",
                }
            )

        return texts, metadata

    def _create_chunks(self, parsed_files: dict[str, ParsedFile]) -> tuple[list[str], list[dict[str, Any]]]:
        """Convert parsed repository structure into search-friendly text chunks and metadata."""
        texts: list[str] = []
        metadata: list[dict[str, Any]] = []

        for file_path, parsed in parsed_files.items():
            f_texts, f_meta = self._create_chunks_for_file(file_path, parsed)
            texts.extend(f_texts)
            metadata.extend(f_meta)

        return texts, metadata
