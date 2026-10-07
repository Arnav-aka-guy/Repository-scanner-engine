"""Tests for hybrid search (BM25 sparse search + FAISS dense search + RRF reranking)."""

from __future__ import annotations

from backend.embeddings.keyword_search import KeywordSearcher
from backend.embeddings.reranker import SearchReranker


def test_keyword_searcher_indexing_and_search() -> None:
    searcher = KeywordSearcher()
    docs = [
        {
            "file_path": "backend/api/auth.py",
            "entity_name": "authenticate_user",
            "entity_type": "function",
            "source_code": "def authenticate_user(token): return token == 'secret'",
            "docstring": "Authenticate JWT token credentials.",
            "start_line": 10,
            "end_line": 20,
        },
        {
            "file_path": "backend/api/search.py",
            "entity_name": "search_code",
            "entity_type": "function",
            "source_code": "def search_code(query): return []",
            "docstring": "Executes hybrid semantic search.",
            "start_line": 15,
            "end_line": 35,
        },
    ]

    searcher.index_documents(docs)
    assert len(searcher.documents) == 2

    # Query for authentication
    hits = searcher.search("authenticate token")
    assert len(hits) > 0
    assert hits[0]["entity_name"] == "authenticate_user"
    assert hits[0]["file_path"] == "backend/api/auth.py"
    assert "keyword_score" in hits[0]


def test_search_reranker_rrf_and_match_types() -> None:
    reranker = SearchReranker()

    vector_results = [
        {
            "score": 0.92,
            "metadata": {
                "file_path": "src/auth.ts",
                "entity_name": "login",
                "entity_type": "function",
                "start_line": 5,
                "end_line": 25,
                "source_code": "export function login() {}",
                "docstring": "Handle login",
            },
        },
        {
            "score": 0.70,
            "metadata": {
                "file_path": "src/utils.ts",
                "entity_name": "formatDate",
                "entity_type": "function",
                "start_line": 1,
                "end_line": 10,
                "source_code": "export function formatDate() {}",
                "docstring": "Format date",
            },
        },
    ]

    keyword_results = [
        {
            "file_path": "src/auth.ts",
            "entity_name": "login",
            "entity_type": "function",
            "start_line": 5,
            "end_line": 25,
            "source_code": "export function login() {}",
            "docstring": "Handle login",
            "keyword_score": 2.5,
        },
        {
            "file_path": "src/config.ts",
            "entity_name": "loginConfig",
            "entity_type": "variable",
            "start_line": 12,
            "end_line": 15,
            "source_code": "export const loginConfig = {};",
            "docstring": "Config for login",
            "keyword_score": 1.8,
        },
    ]

    merged = reranker.rerank(vector_results, keyword_results, top_k=5)
    assert len(merged) == 3

    # Top item appeared in both vector and keyword search -> "hybrid"
    top_hit = merged[0]
    assert top_hit["file_path"] == "src/auth.ts"
    assert top_hit["entity_name"] == "login"
    assert top_hit["match_type"] == "hybrid"
    assert "semantic similarity" in top_hit["match_reasons"]
    assert "keyword match" in top_hit["match_reasons"]
    assert top_hit["score"] > 0.0

    # Item in keyword only -> "keyword"
    kw_only = [item for item in merged if item["entity_name"] == "loginConfig"][0]
    assert kw_only["match_type"] == "keyword"
    assert kw_only["match_reasons"] == ["keyword match"]

    # Item in vector only -> "semantic"
    vec_only = [item for item in merged if item["entity_name"] == "formatDate"][0]
    assert vec_only["match_type"] == "semantic"
    assert vec_only["match_reasons"] == ["semantic similarity"]
