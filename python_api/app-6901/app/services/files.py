from __future__ import annotations

from python_api.common.jobs import JobStore


def get_file_download(job_store: JobStore, file_id: str) -> tuple[bytes, str]:
    """Return (content_bytes, filename) for the given file_id.

    Raises:
        FileNotFoundError: if the file_id is unknown or the file no longer exists on disk.
    """
    record = job_store.get_file(file_id)
    if not record or not record.path.exists():
        raise FileNotFoundError(f"File not found: {file_id}")
    return record.path.read_bytes(), record.filename
