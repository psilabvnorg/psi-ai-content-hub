from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse

from ..deps import get_job_store
from ..services.stt import download_model as stt_download_model
from ..services.stt import progress_store as stt_progress
from ..services.stt import transcribe as stt_transcribe
from ..services.stt import get_result, save_upload
from python_api.common.jobs import JobStore
from fastapi import HTTPException


router = APIRouter(prefix="/api/v1", tags=["stt"])


@router.post("/models/download")
def stt_model_download(payload: dict = Body(None), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    model = (payload or {}).get("model", "large-v3")
    task_id = stt_download_model(job_store, model)
    return StreamingResponse(stt_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/transcribe")
def stt_transcribe_route(
    file: UploadFile = File(...),
    model: str = Form("large-v3"),
    language: Optional[str] = Form("vi"),
    add_punctuation: bool = Form(True),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    content = file.file.read()
    input_path = save_upload(file.filename or "audio.wav", content)
    task_id = stt_transcribe(job_store, input_path, model, language, add_punctuation)
    return {"task_id": task_id}


@router.get("/transcribe/stream/{task_id}")
def stt_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(stt_progress.sse_stream(task_id), media_type="text/event-stream")


@router.get("/transcribe/result/{task_id}")
def stt_result(task_id: str) -> dict:
    payload = get_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="task not found")
    return payload
