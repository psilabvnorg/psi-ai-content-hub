from __future__ import annotations

from typing import Any

from .jobs import JobStore


def stub_workflow(job_store: JobStore, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    job = job_store.create_job()
    job_store.update_job(
        job.job_id,
        "not_implemented",
        result={"status": "not_implemented", "reason": "Workflow not enabled yet"},
    )
    return {"job_id": job.job_id, "status": "not_implemented", "reason": "Workflow not enabled yet"}
