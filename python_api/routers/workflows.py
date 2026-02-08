from __future__ import annotations

import json
import time
from typing import Iterable

from fastapi import APIRouter, Body, Depends
from fastapi.responses import StreamingResponse

from ..deps import get_job_store
from ..services.jobs import JobStore
from ..services.workflow import stub_workflow


router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.post("/reup-youtube/run")
def reup_run(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)


@router.get("/reup-youtube/status/{job_id}")
def reup_status(job_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    job = job_store.get_job(job_id)
    return {"job_id": job_id, "status": job.status if job else "not_found"}


def _stub_stream(job_id: str, status: str) -> Iterable[str]:
    payload = {"job_id": job_id, "status": status, "message": "Workflow not enabled yet", "percent": 100}
    yield f"data: {json.dumps(payload)}\n\n"
    time.sleep(0.1)


@router.get("/reup-youtube/stream/{job_id}")
def reup_stream(job_id: str, job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    job = job_store.get_job(job_id)
    status = job.status if job else "not_found"
    return StreamingResponse(_stub_stream(job_id, status), media_type="text/event-stream")


@router.get("/reup-youtube/result/{job_id}")
def reup_result(job_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    job = job_store.get_job(job_id)
    return job.result if job and job.result else {"status": "not_implemented", "reason": "Workflow not enabled yet"}


@router.get("/reup-youtube/download/{job_id}")
def reup_download(job_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    return {"status": "not_implemented", "reason": "Workflow not enabled yet"}


@router.post("/text-to-video/run")
def text_to_video(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)


@router.post("/news-to-video/run")
def news_to_video(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)


@router.post("/book-to-video/run")
def book_to_video(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)


@router.post("/movie-to-video/run")
def movie_to_video(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)


@router.post("/clone-channel/run")
def clone_channel(payload: dict | None = Body(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    return stub_workflow(job_store, payload)
