from __future__ import annotations

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.background_removal import get_result, process_upload, process_url, progress_store, start_model_download, start_model_load, unload_model


router = APIRouter(prefix="/api/v1", tags=["background-removal"])


@router.post("/remove/upload")
def remove_background_upload(
    file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None:
        raise HTTPException(status_code=400, detail="file is required")
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    image_data = file.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="file is empty")
    task_id = process_upload(job_store, file.filename, image_data)
    return {"task_id": task_id}


@router.post("/remove/url")
def remove_background_url(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    url = str(payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    try:
        task_id = process_url(job_store, url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task_id": task_id}


@router.get("/remove/stream/{task_id}")
def remove_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/remove/result/{task_id}")
def remove_result(task_id: str) -> dict:
    payload = get_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.post("/remove/download")
def download_model_endpoint() -> dict:
    task_id = start_model_download()
    return {"status": "downloading", "task_id": task_id}


@router.post("/remove/load")
def load_model_endpoint() -> dict:
    task_id = start_model_load()
    return {"status": "loading", "task_id": task_id}


@router.post("/remove/unload")
def unload_model_endpoint() -> dict:
    return unload_model()
