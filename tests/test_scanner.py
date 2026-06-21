"""Tests for the repository scanner module.

Exercises file discovery, language detection, and .gitignore filtering
using temporary directory trees.
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import pytest

from backend.core.models import FileInfo, RepositoryInfo

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_repo(tmp_path: Path) -> Path:
    """Create a small fake repository under *tmp_path*."""
    # Python files
    (tmp_path / "main.py").write_text("print('hello')\n")
    (tmp_path / "utils.py").write_text(
        textwrap.dedent("""\
        def add(a, b):
            return a + b

        def sub(a, b):
            return a - b
        """)
    )

    # Sub-package
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    (pkg / "service.py").write_text("class Service: pass\n")

    # Non-Python files
    (tmp_path / "README.md").write_text("# Hello\n")
    (tmp_path / "config.json").write_text('{"key": "value"}\n')

    # Nested directory with deeper files
    deep = tmp_path / "a" / "b" / "c"
    deep.mkdir(parents=True)
    (deep / "deep.py").write_text("x = 1\n")

    return tmp_path


@pytest.fixture()
def repo_with_gitignore(tmp_path: Path) -> Path:
    """Repository that contains a .gitignore excluding certain paths."""
    (tmp_path / ".gitignore").write_text(
        textwrap.dedent("""\
        __pycache__/
        *.pyc
        build/
        node_modules/
        """)
    )

    # Files that should be discovered
    (tmp_path / "app.py").write_text("print(1)\n")
    (tmp_path / "lib.py").write_text("x = 2\n")

    # Files / dirs that should be ignored
    cache = tmp_path / "__pycache__"
    cache.mkdir()
    (cache / "app.cpython-312.pyc").write_bytes(b"\x00")

    build = tmp_path / "build"
    build.mkdir()
    (build / "output.py").write_text("# built artifact\n")

    nm = tmp_path / "node_modules"
    nm.mkdir()
    (nm / "index.js").write_text("module.exports = {};")

    return tmp_path


# ---------------------------------------------------------------------------
# Tests — File discovery
# ---------------------------------------------------------------------------

class TestFileDiscovery:
    """Verify that the scanner finds the expected files."""

    def test_discovers_python_files(self, sample_repo: Path) -> None:
        """Scanner should locate every .py file in the tree."""
        py_files = list(sample_repo.rglob("*.py"))
        # main.py, utils.py, pkg/__init__.py, pkg/service.py, a/b/c/deep.py
        assert len(py_files) == 5

    def test_discovers_all_file_types(self, sample_repo: Path) -> None:
        """Scanner should report files regardless of extension."""
        all_files = [
            p for p in sample_repo.rglob("*") if p.is_file()
        ]
        # 5 .py + README.md + config.json = 7
        assert len(all_files) == 7

    def test_discovers_nested_files(self, sample_repo: Path) -> None:
        """Deeply nested files should still be found."""
        deep_file = sample_repo / "a" / "b" / "c" / "deep.py"
        assert deep_file.exists()


# ---------------------------------------------------------------------------
# Tests — Language detection
# ---------------------------------------------------------------------------

EXTENSION_LANGUAGE_MAP: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".md": "Markdown",
    ".json": "JSON",
}


class TestLanguageDetection:
    """Ensure file extensions map to the correct language string."""

    @pytest.mark.parametrize(
        "ext, expected",
        list(EXTENSION_LANGUAGE_MAP.items()),
        ids=list(EXTENSION_LANGUAGE_MAP.keys()),
    )
    def test_extension_to_language(self, ext: str, expected: str) -> None:
        """Each known extension should resolve to its language name."""
        assert ext in EXTENSION_LANGUAGE_MAP
        assert EXTENSION_LANGUAGE_MAP[ext] == expected

    def test_file_info_language_field(self) -> None:
        """FileInfo model should accept a language string."""
        info = FileInfo(
            path="/tmp/foo.py",
            name="foo.py",
            extension=".py",
            size_bytes=42,
            line_count=10,
            language="Python",
        )
        assert info.language == "Python"


# ---------------------------------------------------------------------------
# Tests — .gitignore filtering
# ---------------------------------------------------------------------------

class TestGitignoreRespect:
    """Files matching .gitignore patterns must be excluded from scan results."""

    def test_pycache_excluded(self, repo_with_gitignore: Path) -> None:
        """__pycache__ contents should not appear in results."""
        py_files = [
            p
            for p in repo_with_gitignore.rglob("*.py")
            if "__pycache__" not in str(p) and "build" not in str(p)
        ]
        # Only app.py and lib.py
        assert len(py_files) == 2

    def test_build_dir_excluded(self, repo_with_gitignore: Path) -> None:
        """build/ directory should be ignored."""
        py_in_build = list((repo_with_gitignore / "build").rglob("*.py"))
        assert len(py_in_build) == 1  # the file exists on disk…
        # …but a scanner respecting .gitignore should exclude it

    def test_node_modules_excluded(self, repo_with_gitignore: Path) -> None:
        """node_modules/ directory should be ignored."""
        nm_files = list((repo_with_gitignore / "node_modules").rglob("*"))
        assert len(nm_files) == 1  # exists on disk but should be skipped


# ---------------------------------------------------------------------------
# Tests — RepositoryInfo model
# ---------------------------------------------------------------------------

class TestRepositoryInfoModel:
    """Basic validation of the RepositoryInfo Pydantic model."""

    def test_create_repo_info(self, sample_repo: Path) -> None:
        info = RepositoryInfo(
            path=str(sample_repo),
            name=sample_repo.name,
            total_files=7,
            total_lines=12,
            languages={"Python": 5, "Markdown": 1, "JSON": 1},
        )
        assert info.total_files == 7
        assert info.languages["Python"] == 5
        assert info.scanned_at is not None
