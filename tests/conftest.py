"""Shared test setup.

Tests use the lightweight mock embedding model by default so the suite runs
without downloading sentence-transformers weights. Set MOCK_EMBEDDINGS=false
to run against the real model.
"""

import os

os.environ.setdefault("MOCK_EMBEDDINGS", "true")
