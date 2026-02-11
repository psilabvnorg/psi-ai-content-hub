from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..deps import get_job_store
from ..services.tts import (
    download_model as tts_download_model,
    generate as tts_generate,
    get_download_file_id,
    get_model_configs,
    get_voices,
    load_model as tts_load_model,
    unload_model as tts_unload_model,
    progress_store,
)
from python_api.common.jobs import JobStore


router = APIRouter(prefix="/api/v1", tags=["vieneu-tts"])


@router.get("/voices")
def tts_voices() -> dict:
    return get_voices()


@router.get("/models/configs")
def tts_model_configs() -> dict:
    return get_model_configs()


@router.post("/models/download")
def tts_model_download(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    backbone = payload.get("backbone")
    codec = payload.get("codec")
    if not backbone or not codec:
        raise HTTPException(status_code=400, detail="backbone and codec are required")
    task_id = tts_download_model(job_store, backbone, codec)
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.post("/models/load")
def tts_model_load(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    backbone = payload.get("backbone")
    codec = payload.get("codec")
    device = payload.get("device", "auto")
    if not backbone or not codec:
        raise HTTPException(status_code=400, detail="backbone and codec are required")
    task_id = tts_load_model(job_store, backbone, codec, device)
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.post("/models/unload")
def tts_model_unload() -> dict:
    tts_unload_model()
    return {"status": "success", "message": "Model unloaded"}


@router.post("/generate")
def tts_generate_route(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    text = (payload.get("text") or "").strip()
    mode = payload.get("mode", "preset")
    voice_id = payload.get("voice_id")
    sample_voice_id = payload.get("sample_voice_id")
    sample_text_id = payload.get("sample_text_id")
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    task_id = tts_generate(job_store, text, mode, voice_id, sample_voice_id, sample_text_id)
    return {"task_id": task_id}


@router.get("/generate/stream/{task_id}")
def tts_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/generate/download/{task_id}")
def tts_download(task_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    file_id = get_download_file_id(task_id)
    if not file_id:
        raise HTTPException(status_code=404, detail="file not ready")
    record = job_store.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="file not found")
    return {"status": "success", "filename": record.filename, "download_url": f"/api/v1/files/{file_id}"}
