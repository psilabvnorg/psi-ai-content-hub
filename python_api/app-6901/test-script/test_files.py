from __future__ import annotations

import pytest
from python_api.common.jobs import JobStore

from app.services.files import get_file_download


# ---------------------------------------------------------------------------
# get_file_download
# ---------------------------------------------------------------------------

def test_get_file_download_success(tmp_path, job_store):
    """Returns (bytes, filename) for a known file_id when the file exists."""
    file_content = b"hello binary content"
    tmp_file = tmp_path / "test_audio.mp3"
    tmp_file.write_bytes(file_content)

    record = job_store.add_file(tmp_file, "test_audio.mp3")
    content, filename = get_file_download(job_store, record.file_id)

    assert content == file_content
    assert filename == "test_audio.mp3"


def test_get_file_download_returns_correct_bytes(tmp_path, job_store):
    """Returned bytes exactly match the file's content."""
    data = b"\x00\x01\x02\xFFsome data"
    f = tmp_path / "blob.bin"
    f.write_bytes(data)

    record = job_store.add_file(f, "blob.bin")
    content, _ = get_file_download(job_store, record.file_id)
    assert content == data


def test_get_file_download_returns_correct_filename(tmp_path, job_store):
    """Second tuple element matches the filename stored in the record."""
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    record = job_store.add_file(f, "my_video_file.mp4")
    _, filename = get_file_download(job_store, record.file_id)
    assert filename == "my_video_file.mp4"


def test_get_file_download_unknown_id_raises(job_store):
    """FileNotFoundError raised when file_id is not in the store."""
    with pytest.raises(FileNotFoundError):
        get_file_download(job_store, "file_nonexistent_id")


def test_get_file_download_file_deleted_from_disk(tmp_path, job_store):
    """FileNotFoundError raised when record exists but the file was deleted."""
    f = tmp_path / "gone.mp3"
    f.write_bytes(b"data")
    record = job_store.add_file(f, "gone.mp3")
    f.unlink()  # delete the actual file

    with pytest.raises(FileNotFoundError):
        get_file_download(job_store, record.file_id)
