from __future__ import annotations

from python_api.common.jobs import JobStore


job_store = JobStore()


def get_job_store() -> JobStore:
    return job_store
