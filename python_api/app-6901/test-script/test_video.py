from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest

from python_api.common.jobs import JobStore
from app.services.video import get_download_status, start_download


# ---------------------------------------------------------------------------
# get_download_status
# ---------------------------------------------------------------------------

def test_get_download_status_existing_job(job_store):
    job = job_store.create_job()
    result = get_download_status(job_store, job.job_id)
    assert result is not None
    assert result["job_id"] == job.job_id


def test_get_download_status_missing_job(job_store):
    result = get_download_status(job_store, "nonexistent_job_id")
    assert result is None


def test_get_download_status_has_required_keys(job_store):
    job = job_store.create_job()
    result = get_download_status(job_store, job.job_id)
    for key in ("job_id", "status", "result", "error"):
        assert key in result


def test_get_download_status_completed_job(job_store):
    job = job_store.create_job()
    job_store.update_job(job.job_id, "complete", result={"filename": "video.mp4"})
    result = get_download_status(job_store, job.job_id)
    assert result["status"] == "complete"
    assert result["result"]["filename"] == "video.mp4"


def test_get_download_status_error_job(job_store):
    job = job_store.create_job()
    job_store.update_job(job.job_id, "error", error="yt-dlp not found")
    result = get_download_status(job_store, job.job_id)
    assert result["status"] == "error"
    assert result["error"] == "yt-dlp not found"


# ---------------------------------------------------------------------------
# start_download
# ---------------------------------------------------------------------------

def test_start_download_returns_job_id(job_store):
    with patch("app.services.video.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        job_id = start_download(job_store, "https://example.com/video", "youtube")
    assert isinstance(job_id, str)
    assert len(job_id) > 0


def test_start_download_job_created_in_store(job_store):
    with patch("app.services.video.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        job_id = start_download(job_store, "https://example.com/video", "youtube")
    record = job_store.get_job(job_id)
    assert record is not None
    assert record.job_id == job_id


def test_start_download_thread_spawned(job_store):
    with patch("app.services.video.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        start_download(job_store, "https://example.com/video", "youtube")
    mock_thread.assert_called_once()
    mock_thread.return_value.start.assert_called_once()


def test_start_download_thread_is_daemon(job_store):
    with patch("app.services.video.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        start_download(job_store, "https://example.com/video", "youtube")
    call_kwargs = mock_thread.call_args[1]
    assert call_kwargs.get("daemon") is True


def test_start_download_yt_dlp_not_found_raises_in_runner(job_store, tmp_path):
    """When yt_dlp is not found, runner sets job to error status."""
    # Capture the thread target to run synchronously
    captured_target = {}

    def fake_thread(**kwargs):
        captured_target["fn"] = kwargs.get("target")
        m = MagicMock()
        m.start = MagicMock()
        return m

    with patch("app.services.video.threading.Thread", side_effect=fake_thread):
        with patch("app.services.video.aget_yt_dlp_bin_path_data", return_value=None):
            with patch("app.services.video.TEMP_DIR", tmp_path):
                with patch("app.services.video.sys.executable", str(tmp_path / "python.exe")):
                    job_id = start_download(job_store, "https://example.com/v", "youtube")

    # Run the thread target synchronously
    if captured_target.get("fn"):
        captured_target["fn"]()

    record = job_store.get_job(job_id)
    assert record.status == "error"
    assert "yt-dlp" in (record.error or "")
