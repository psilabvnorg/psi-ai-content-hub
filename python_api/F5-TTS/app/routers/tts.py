from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..deps import get_job_store
from ..services.voice_clone import (
    download_model,
    generate,
    get_download_file_id,
    list_samples,
    list_voices,
    progress_store,
)
from python_api.common.jobs import JobStore


router = APIRouter(prefix="/api/v1", tags=["f5-tts"])


@router.post("/models/download")
def model_download(job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    task_id = download_model(job_store)
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/voices")
def voices() -> dict:
    return list_voices()


@router.get("/samples")
def samples() -> dict:
    return list_samples()


@router.post("/generate")
def generate_voice(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    voice_id = payload.get("voice_id")
    text = (payload.get("text") or "").strip()
    speed = float(payload.get("speed", 1.0))
    cfg_strength = float(payload.get("cfg_strength", 2.0))
    nfe_step = int(payload.get("nfe_step", 32))
    remove_silence = bool(payload.get("remove_silence", False))
    if not voice_id or not text:
        raise HTTPException(status_code=400, detail="voice_id and text are required")
    task_id = generate(job_store, voice_id, text, speed, cfg_strength, nfe_step, remove_silence)
    return {"task_id": task_id}


@router.get("/generate/stream/{task_id}")
def generate_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/generate/download/{task_id}")
def generate_download(task_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    file_id = get_download_file_id(task_id)
    if not file_id:
        raise HTTPException(status_code=404, detail="file not ready")
    record = job_store.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="file not found")
    return {"status": "success", "filename": record.filename, "download_url": f"/api/v1/files/{file_id}"}
