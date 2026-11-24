"""Test that backend models return UTC-aware datetimes with timezone offsets."""

from datetime import datetime

from backend.api.repositories import RepositoryItem
from backend.core.models import RepositoryInfo


def test_repository_item_last_scanned_at_timezone():
    naive = datetime(2026, 11, 23, 16, 7, 57, 37325)
    item = RepositoryItem(
        id=1,
        name="test-repo",
        source_path="/tmp/test",
        last_scanned_at=naive,
        created_at=naive,
    )
    dumped = item.model_dump(mode="json")
    assert dumped["last_scanned_at"].endswith("Z") or dumped["last_scanned_at"].endswith("+00:00")
    assert dumped["created_at"].endswith("Z") or dumped["created_at"].endswith("+00:00")


def test_repository_info_scanned_at_timezone():
    naive = datetime(2026, 11, 23, 16, 7, 57, 37325)
    info = RepositoryInfo(
        path="/tmp/test",
        name="test-repo",
        total_files=10,
        total_lines=100,
        scanned_at=naive,
    )
    dumped = info.model_dump(mode="json")
    assert dumped["scanned_at"].endswith("Z") or dumped["scanned_at"].endswith("+00:00")
