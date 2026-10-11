import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.mark.asyncio
async def test_scan_job_lifecycle_and_sse_events(tmp_path):
    # Create test repo
    test_file = tmp_path / "main.py"
    test_file.write_text("def hello():\n    print('world')\n")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Trigger async scan
        resp = await client.post(
            "/api/repository/scan/async",
            json={"path": str(tmp_path)},
        )
        assert resp.status_code == 200
        data = resp.json()
        job_id = data["job_id"]
        assert data["status"] in ("pending", "scanning", "completed")

        # Check job status via polling endpoint
        poll_resp = await client.get(f"/api/repository/scan/jobs/{job_id}")
        assert poll_resp.status_code == 200
        poll_data = poll_resp.json()
        assert poll_data["job_id"] == job_id

        # Check SSE stream endpoint emits progress / done events
        sse_resp = await client.get(f"/api/scans/{job_id}/events")
        assert sse_resp.status_code == 200
        assert "text/event-stream" in sse_resp.headers["content-type"]
        body_text = sse_resp.text
        assert "event: progress" in body_text or "event: done" in body_text


@pytest.mark.asyncio
async def test_compute_once_read_many_analysis_cache(tmp_path):
    from backend.storage.persistence import (
        invalidate_analysis_cache,
        load_analysis_cache,
        save_analysis_cache,
    )

    repo_path = str(tmp_path)
    # Initially no cache
    assert load_analysis_cache(repo_path, "health_score") is None

    # Save mock cache
    save_analysis_cache(repo_path, "health_score", {"total_score": 92.5, "grade": "A"})
    cached = load_analysis_cache(repo_path, "health_score")
    assert cached is not None
    assert cached["total_score"] == 92.5

    # Invalidate cache
    invalidate_analysis_cache(repo_path)
    assert load_analysis_cache(repo_path, "health_score") is None
