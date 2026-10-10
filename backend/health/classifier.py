"""File category classification for score isolation.

Categorizes files into:
- source (the only files factored into complexity and maintainability scores)
- test (analyzed for test ratio / coverage signals, but complexity excluded from health score)
- documentation
- example
- migration
- vendor
- generated
"""

from __future__ import annotations

import re

_TEST_PATTERNS = [
    re.compile(r"(?:^|/)(?:tests?|__tests__|spec|specs)/", re.I),
    re.compile(r"(?:^|/)(?:test_[^/]+|[^/]+_test|[^/]+\.spec|[^/]+\.test)\.[a-zA-Z0-9]+$", re.I),
]

_DOCS_PATTERNS = [
    re.compile(r"(?:^|/)(?:docs?|documentation)/", re.I),
    re.compile(r"\.(?:md|rst|txt|adoc)$", re.I),
]

_EXAMPLES_PATTERNS = [
    re.compile(r"(?:^|/)(?:examples?|samples?|demos?)/", re.I),
]

_MIGRATION_PATTERNS = [
    re.compile(r"(?:^|/)(?:migrations?|alembic/versions)/", re.I),
]

_VENDOR_PATTERNS = [
    re.compile(r"(?:^|/)(?:vendor|node_modules|\.venv|venv|dist|build)/", re.I),
]

_GENERATED_PATTERNS = [
    re.compile(r"(?:^|/)(?:generated|\.gen|\.min)\.[a-zA-Z0-9]+$", re.I),
    re.compile(r"\.(?:pb\.go|_pb2\.py|\.d\.ts)$", re.I),
]


def classify_file(file_path: str) -> str:
    """Classify a relative or absolute file path into its structural domain role."""
    norm = file_path.replace("\\", "/").strip()

    for pat in _VENDOR_PATTERNS:
        if pat.search(norm):
            return "vendor"

    for pat in _GENERATED_PATTERNS:
        if pat.search(norm):
            return "generated"

    for pat in _MIGRATION_PATTERNS:
        if pat.search(norm):
            return "migration"

    for pat in _TEST_PATTERNS:
        if pat.search(norm):
            return "test"

    for pat in _EXAMPLES_PATTERNS:
        if pat.search(norm):
            return "example"

    for pat in _DOCS_PATTERNS:
        if pat.search(norm):
            return "documentation"

    return "source"


def is_source_file(file_path: str) -> bool:
    """Return True if the file should have its internal complexity scored."""
    return classify_file(file_path) == "source"
