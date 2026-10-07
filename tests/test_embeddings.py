"""Tests for the embeddings / vector-store module.

Validates that sentence-transformer encoding produces vectors of the expected
dimensionality, and that a FAISS-backed vector store supports add, search,
save, and load operations.

These tests load ML models and may be slow — marked with @pytest.mark.slow.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Optional-import guards — skip if heavy deps are missing
# ---------------------------------------------------------------------------

try:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]
except ImportError:
    SentenceTransformer = None  # type: ignore[assignment,misc]

try:
    import numpy as np  # type: ignore[import-untyped]
except ImportError:
    np = None  # type: ignore[assignment]

try:
    import faiss  # type: ignore[import-untyped]
except ImportError:
    faiss = None  # type: ignore[assignment]

# Marker applied to every test in this module
pytestmark = pytest.mark.slow

# Model used across all tests (small and fast to download)
MODEL_NAME = "all-MiniLM-L6-v2"
EXPECTED_DIM = 384  # output dimension for all-MiniLM-L6-v2


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def model():
    """Load the sentence-transformer model once per test module."""
    if SentenceTransformer is None:
        pytest.skip("sentence-transformers not installed")
    return SentenceTransformer(MODEL_NAME)


@pytest.fixture()
def sample_texts() -> list[str]:
    """Diverse code-related sentences for embedding."""
    return [
        "def authenticate(user, password): verify credentials and return token",
        "class DatabaseConnection: manages PostgreSQL connection pooling",
        "import os; import sys; import pathlib",
        "The function calculates the Fibonacci sequence recursively",
        "REST API endpoint for user registration and login",
        "Unit test for the payment processing module",
    ]


# ---------------------------------------------------------------------------
# Tests — Encoding dimensionality
# ---------------------------------------------------------------------------

class TestEncoding:
    """Verify that the model produces vectors with correct shape."""

    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    def test_single_encoding_shape(self, model) -> None:
        """A single string should produce a 1-D vector of EXPECTED_DIM."""
        vec = model.encode("hello world")
        assert vec.shape == (EXPECTED_DIM,)

    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    def test_batch_encoding_shape(self, model, sample_texts: list[str]) -> None:
        """Batch encoding should return (n, EXPECTED_DIM)."""
        vecs = model.encode(sample_texts)
        assert vecs.shape == (len(sample_texts), EXPECTED_DIM)

    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    def test_encoding_dtype(self, model) -> None:
        """Embeddings should be float32 by default."""
        vec = model.encode("test")
        assert vec.dtype.name.startswith("float")

    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    def test_similar_texts_closer(self, model) -> None:
        """Semantically similar texts should have higher cosine similarity."""
        if np is None:
            pytest.skip("numpy not installed")
        vec_a = model.encode("user authentication login")
        vec_b = model.encode("user login authentication flow")
        vec_c = model.encode("database connection pooling")

        def cosine(u, v):
            return float(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v)))

        sim_ab = cosine(vec_a, vec_b)
        sim_ac = cosine(vec_a, vec_c)
        assert sim_ab > sim_ac, "Similar texts should be closer in embedding space"


# ---------------------------------------------------------------------------
# Tests — FAISS vector store
# ---------------------------------------------------------------------------

class TestVectorStore:
    """Basic FAISS index operations: add, search, save, load."""

    @pytest.mark.skipif(faiss is None, reason="faiss not installed")
    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    @pytest.mark.skipif(np is None, reason="numpy not installed")
    def test_add_and_search(self, model, sample_texts: list[str]) -> None:
        """Adding vectors and searching should return the nearest neighbour."""
        vecs = model.encode(sample_texts).astype("float32")

        index = faiss.IndexFlatL2(EXPECTED_DIM)
        index.add(vecs)

        assert index.ntotal == len(sample_texts)

        # Search with the first vector — it should match itself
        query = vecs[:1]
        distances, indices = index.search(query, k=1)
        assert indices[0][0] == 0
        assert distances[0][0] == pytest.approx(0.0, abs=1e-5)

    @pytest.mark.skipif(faiss is None, reason="faiss not installed")
    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    @pytest.mark.skipif(np is None, reason="numpy not installed")
    def test_top_k_search(self, model, sample_texts: list[str]) -> None:
        """Top-k search should return k results sorted by distance."""
        vecs = model.encode(sample_texts).astype("float32")

        index = faiss.IndexFlatL2(EXPECTED_DIM)
        index.add(vecs)

        query = vecs[:1]
        k = 3
        distances, indices = index.search(query, k=k)
        assert len(indices[0]) == k
        # Distances should be non-decreasing
        for i in range(k - 1):
            assert distances[0][i] <= distances[0][i + 1]

    @pytest.mark.skipif(faiss is None, reason="faiss not installed")
    @pytest.mark.skipif(SentenceTransformer is None, reason="sentence-transformers not installed")
    @pytest.mark.skipif(np is None, reason="numpy not installed")
    def test_save_and_load(self, model, sample_texts: list[str], tmp_path: Path) -> None:
        """Saving and reloading a FAISS index should preserve search results."""
        vecs = model.encode(sample_texts).astype("float32")

        index = faiss.IndexFlatL2(EXPECTED_DIM)
        index.add(vecs)

        index_path = str(tmp_path / "test.faiss")
        faiss.write_index(index, index_path)

        loaded_index = faiss.read_index(index_path)
        assert loaded_index.ntotal == index.ntotal

        query = vecs[:1]
        d_orig, i_orig = index.search(query, k=2)
        d_loaded, i_loaded = loaded_index.search(query, k=2)

        assert list(i_orig[0]) == list(i_loaded[0])
        for a, b in zip(d_orig[0], d_loaded[0], strict=False):
            assert a == pytest.approx(b, abs=1e-6)

    @pytest.mark.skipif(faiss is None, reason="faiss not installed")
    @pytest.mark.skipif(np is None, reason="numpy not installed")
    def test_empty_index_search(self) -> None:
        """Searching an empty index should return empty results gracefully."""
        index = faiss.IndexFlatL2(EXPECTED_DIM)
        assert index.ntotal == 0

        query = np.random.rand(1, EXPECTED_DIM).astype("float32")
        distances, indices = index.search(query, k=1)
        # FAISS returns -1 for indices when no results
        assert indices[0][0] == -1


# ---------------------------------------------------------------------------
# Tests — Metadata store (simple JSON sidecar pattern)
# ---------------------------------------------------------------------------

class TestMetadataStore:
    """The vector store should pair each vector with retrievable metadata."""

    def test_metadata_roundtrip(self, tmp_path: Path) -> None:
        """Save and load a JSON metadata sidecar alongside the FAISS index."""
        metadata = [
            {"file": "main.py", "entity": "main", "type": "function"},
            {"file": "utils.py", "entity": "helper", "type": "function"},
        ]
        meta_path = tmp_path / "meta.json"
        meta_path.write_text(json.dumps(metadata), encoding="utf-8")

        loaded = json.loads(meta_path.read_text(encoding="utf-8"))
        assert len(loaded) == 2
        assert loaded[0]["file"] == "main.py"

    def test_metadata_alignment(self, tmp_path: Path) -> None:
        """Metadata list length should match the number of vectors in the index."""
        if faiss is None or np is None:
            pytest.skip("faiss or numpy not installed")

        n = 5
        dim = EXPECTED_DIM
        vecs = np.random.rand(n, dim).astype("float32")
        metadata = [{"id": i, "label": f"item_{i}"} for i in range(n)]

        index = faiss.IndexFlatL2(dim)
        index.add(vecs)

        assert index.ntotal == len(metadata)
