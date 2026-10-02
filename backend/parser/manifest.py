"""File manifest and change detection for incremental scanning."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from backend.core.models import FileInfo

logger = logging.getLogger(__name__)


def compute_file_hash(path: Path | str) -> str:
    """Compute SHA-256 hash of a file's content."""
    p = Path(path)
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def get_repo_id(repo_path: str) -> str:
    """Derive a stable, filesystem-safe repository identifier."""
    clean = Path(repo_path).name or "default"
    clean = "".join(c for c in clean if c.isalnum() or c in ("-", "_")) or "repo"
    digest = hashlib.sha256(str(Path(repo_path).resolve()).encode()).hexdigest()[:8]
    return f"{clean}_{digest}"


class FileRecord(BaseModel):
    """Cached metadata for a single file."""

    path: str
    size: int
    mtime: float
    hash: str


class RepoManifest(BaseModel):
    """Manifest tracking scanned files and their hashes."""

    repo_path: str
    files: dict[str, FileRecord] = Field(default_factory=dict)

    def save(self, cache_file: Path | str) -> None:
        """Persist manifest to JSON."""
        p = Path(cache_file)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(self.model_dump_json(indent=2))

    @classmethod
    def load(cls, cache_file: Path | str) -> RepoManifest | None:
        """Load manifest from JSON if it exists."""
        p = Path(cache_file)
        if not p.exists():
            return None
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
            return cls.model_validate(data)
        except Exception as exc:
            logger.warning("Failed to load manifest from %s: %s", p, exc)
            return None


class ManifestDiff(BaseModel):
    """Diff between a previous manifest and current disk state."""

    new_files: list[str] = Field(default_factory=list)
    modified_files: list[str] = Field(default_factory=list)
    deleted_files: list[str] = Field(default_factory=list)
    unchanged_files: list[str] = Field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        """True if any file was added, modified, or deleted."""
        return bool(self.new_files or self.modified_files or self.deleted_files)


def build_manifest_diff(
    previous: RepoManifest | None,
    current_files: list[FileInfo],
    repo_path: str,
) -> tuple[RepoManifest, ManifestDiff]:
    """Compare discovered files against previous manifest and produce diff."""
    new_records: dict[str, FileRecord] = {}
    diff = ManifestDiff()

    prev_files = previous.files if previous else {}

    for fi in current_files:
        p = Path(fi.path).resolve()
        fpath = str(p)
        try:
            stat = p.stat()
            current_size = stat.st_size
            current_mtime = stat.st_mtime
        except OSError:
            continue

        prev_rec = prev_files.get(fpath)
        if prev_rec is not None:
            # Check if size and mtime match
            if prev_rec.size == current_size and abs(prev_rec.mtime - current_mtime) < 1e-4:
                file_hash = prev_rec.hash
                diff.unchanged_files.append(fpath)
            else:
                # Size or mtime changed, compute hash to verify
                file_hash = compute_file_hash(p)
                if file_hash == prev_rec.hash:
                    diff.unchanged_files.append(fpath)
                else:
                    diff.modified_files.append(fpath)
        else:
            file_hash = compute_file_hash(p)
            diff.new_files.append(fpath)

        new_records[fpath] = FileRecord(
            path=fpath,
            size=current_size,
            mtime=current_mtime,
            hash=file_hash,
        )

    # Detect deleted files
    current_paths = set(new_records.keys())
    for prev_path in prev_files:
        if prev_path not in current_paths:
            diff.deleted_files.append(prev_path)

    new_manifest = RepoManifest(
        repo_path=repo_path,
        files=new_records,
    )
    return new_manifest, diff
