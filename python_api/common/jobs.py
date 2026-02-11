from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional


RETENTION_SECONDS = 60 * 60


def _now() -> float:
    return time.time()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


@dataclass
class JobRecord:
    job_id: str
    status: str = "queued"
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=_now)
    updated_at: float = field(default_factory=_now)


@dataclass
class FileRecord:
    file_id: str
    path: Path
    filename: str
    created_at: float = field(default_factory=_now)


class JobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, JobRecord] = {}
        self._files: Dict[str, FileRecord] = {}
        self._lock = threading.Lock()

    def create_job(self) -> JobRecord:
        job_id = _new_id("job")
        record = JobRecord(job_id=job_id)
        with self._lock:
            self._jobs[job_id] = record
        return record

    def update_job(self, job_id: str, status: str, result: Optional[dict] = None, error: Optional[str] = None) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if not record:
                return
            record.status = status
            record.result = result
            record.error = error
            record.updated_at = _now()

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def add_file(self, path: Path, filename: str) -> FileRecord:
        file_id = _new_id("file")
        record = FileRecord(file_id=file_id, path=path, filename=filename)
        with self._lock:
            self._files[file_id] = record
        return record

    def get_file(self, file_id: str) -> Optional[FileRecord]:
        with self._lock:
            return self._files.get(file_id)

    def cleanup(self) -> None:
        cutoff = _now() - RETENTION_SECONDS
        with self._lock:
            expired_jobs = [job_id for job_id, job in self._jobs.items() if job.updated_at < cutoff]
            for job_id in expired_jobs:
                self._jobs.pop(job_id, None)

            expired_files = [file_id for file_id, record in self._files.items() if record.created_at < cutoff]
            for file_id in expired_files:
                record = self._files.pop(file_id, None)
                if record:
                    try:
                        if record.path.exists():
                            os.remove(record.path)
                    except Exception:
                        pass
