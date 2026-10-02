"""Tests for file-level incremental scanning, manifest diffing, and embedding reuse."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from backend.core.models import FileInfo
from backend.embeddings.service import EmbeddingsService
from backend.parser.manifest import (
    FileRecord,
    RepoManifest,
    build_manifest_diff,
    compute_file_hash,
    get_repo_id,
)
from backend.parser.service import ParserService


@pytest.fixture
def temp_repo():
    """Create a temporary repository directory with initial files."""
    tmpdir = tempfile.mkdtemp(prefix="repo_inc_test_")
    repo = Path(tmpdir).resolve()

    # Initial file 1
    (repo / "alpha.py").write_text("def alpha():\n    return 'alpha'\n", encoding="utf-8")
    # Initial file 2
    (repo / "beta.py").write_text("def beta():\n    return 'beta'\n", encoding="utf-8")

    yield repo
    shutil.rmtree(tmpdir, ignore_errors=True)


class TestIncrementalScanning:
    """Test incremental manifest calculation and diffing."""

    def test_compute_file_hash_differs_on_modification(self, temp_repo: Path) -> None:
        file_path = temp_repo / "alpha.py"
        h1 = compute_file_hash(file_path)

        file_path.write_text("def alpha():\n    return 'alpha_v2'\n", encoding="utf-8")
        h2 = compute_file_hash(file_path)

        assert h1 != h2

    def test_manifest_diff_new_and_unchanged_files(self, temp_repo: Path) -> None:
        parser = ParserService()
        files = parser._scanner.get_files(str(temp_repo))

        manifest1, diff1 = build_manifest_diff(None, files, str(temp_repo))
        # Initial run: all files are new
        assert len(diff1.new_files) == 2
        assert len(diff1.unchanged_files) == 0
        assert diff1.has_changes is True

        # Second run without changes
        manifest2, diff2 = build_manifest_diff(manifest1, files, str(temp_repo))
        assert len(diff2.new_files) == 0
        assert len(diff2.modified_files) == 0
        assert len(diff2.deleted_files) == 0
        assert len(diff2.unchanged_files) == 2
        assert diff2.has_changes is False

    def test_manifest_diff_modified_file(self, temp_repo: Path) -> None:
        parser = ParserService()
        files = parser._scanner.get_files(str(temp_repo))
        manifest1, _ = build_manifest_diff(None, files, str(temp_repo))

        # Modify alpha.py
        (temp_repo / "alpha.py").write_text("def alpha_modified():\n    pass\n", encoding="utf-8")

        files_after = parser._scanner.get_files(str(temp_repo))
        manifest2, diff2 = build_manifest_diff(manifest1, files_after, str(temp_repo))

        assert str(temp_repo / "alpha.py") in diff2.modified_files
        assert str(temp_repo / "beta.py") in diff2.unchanged_files
        assert len(diff2.deleted_files) == 0
        assert diff2.has_changes is True

    def test_manifest_diff_deleted_file(self, temp_repo: Path) -> None:
        parser = ParserService()
        files = parser._scanner.get_files(str(temp_repo))
        manifest1, _ = build_manifest_diff(None, files, str(temp_repo))

        # Delete beta.py
        (temp_repo / "beta.py").unlink()

        files_after = parser._scanner.get_files(str(temp_repo))
        manifest2, diff2 = build_manifest_diff(manifest1, files_after, str(temp_repo))

        assert str(temp_repo / "beta.py") in diff2.deleted_files
        assert str(temp_repo / "alpha.py") in diff2.unchanged_files
        assert len(diff2.new_files) == 0
        assert diff2.has_changes is True

    def test_manifest_diff_renamed_file(self, temp_repo: Path) -> None:
        parser = ParserService()
        files = parser._scanner.get_files(str(temp_repo))
        manifest1, _ = build_manifest_diff(None, files, str(temp_repo))

        # Rename beta.py to gamma.py
        (temp_repo / "beta.py").rename(temp_repo / "gamma.py")

        files_after = parser._scanner.get_files(str(temp_repo))
        manifest2, diff2 = build_manifest_diff(manifest1, files_after, str(temp_repo))

        assert str(temp_repo / "beta.py") in diff2.deleted_files
        assert str(temp_repo / "gamma.py") in diff2.new_files
        assert str(temp_repo / "alpha.py") in diff2.unchanged_files


@pytest.mark.asyncio
class TestIncrementalParserAndEmbeddings:
    """Test ParserService and EmbeddingsService incremental behaviors."""

    async def test_parser_service_incremental_skips_unchanged(self, temp_repo: Path) -> None:
        parser = ParserService()

        # First parse
        parsed1 = await parser.parse_repository(str(temp_repo), incremental=True)
        assert len(parsed1) == 2
        assert "alpha" in [f.name for f in parsed1[str(temp_repo / "alpha.py")].functions]

        # Add a new function to alpha.py
        (temp_repo / "alpha.py").write_text(
            "def alpha():\n    pass\n\ndef alpha_extra():\n    pass\n",
            encoding="utf-8",
        )

        # Second parse
        parsed2 = await parser.parse_repository(str(temp_repo), incremental=True)
        alpha_funcs = [f.name for f in parsed2[str(temp_repo / "alpha.py")].functions]
        assert "alpha_extra" in alpha_funcs

        diff = parser.get_last_diff(str(temp_repo))
        assert diff is not None
        assert str(temp_repo / "alpha.py") in diff.modified_files
        assert str(temp_repo / "beta.py") in diff.unchanged_files

    async def test_embeddings_service_incremental_caching(self, temp_repo: Path) -> None:
        parser = ParserService()
        embeddings = EmbeddingsService()

        parsed = await parser.parse_repository(str(temp_repo))
        count1 = await embeddings.index_repository(parsed, repo_path=str(temp_repo))
        assert count1 > 0

        repo_id = embeddings._get_repo_id(str(temp_repo))
        assert repo_id in embeddings._file_embeddings_cache
        cached_files = embeddings._file_embeddings_cache[repo_id]
        assert str(temp_repo / "alpha.py") in cached_files

        # Add gamma.py
        (temp_repo / "gamma.py").write_text("def gamma():\n    return 42\n", encoding="utf-8")
        parsed2 = await parser.parse_repository(str(temp_repo))

        count2 = await embeddings.index_repository(parsed2, repo_path=str(temp_repo))
        assert count2 > count1
        assert str(temp_repo / "gamma.py") in embeddings._file_embeddings_cache[repo_id]

        # Delete alpha.py and re-index
        (temp_repo / "alpha.py").unlink()
        parsed3 = await parser.parse_repository(str(temp_repo))
        count3 = await embeddings.index_repository(parsed3, repo_path=str(temp_repo))

        assert str(temp_repo / "alpha.py") not in embeddings._file_embeddings_cache[repo_id]
