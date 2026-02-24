from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.translation import (
    download_model,
    get_model_status,
    get_translation_status,
    load_model,
    start_translation,
    translation_progress,
    unload_model,
)


router = APIRouter(prefix="", tags=["translation"])


def _validate_segments(raw_segments: Any) -> list[dict] | None:
    if raw_segments is None:
        return None
    if not isinstance(raw_segments, list):
        raise HTTPException(status_code=400, detail="segments must be a list")

    normalized: list[dict] = []
    for index, item in enumerate(raw_segments):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"segments[{index}] must be an object")
        text = item.get("text")
        if not isinstance(text, str) or not text.strip():
            raise HTTPException(status_code=400, detail=f"segments[{index}].text is required")
        normalized.append(item)
    return normalized


@router.post("/translate")
def translate(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    """Start translation job in simple text mode or segment mode."""
    source_lang = str(payload.get("source_lang") or "").strip()
    target_lang = str(payload.get("target_lang") or "").strip()
    text = str(payload.get("text") or "").strip()
    preserve_emotion = bool(payload.get("preserve_emotion", True))
    segments = _validate_segments(payload.get("segments"))

    if not source_lang or not target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang are required")
    if not text and not segments:
        raise HTTPException(status_code=400, detail="Either text or segments is required")

    job_id = start_translation(
        job_store=job_store,
        text=text,
        source_lang=source_lang,
        target_lang=target_lang,
        segments=segments,
        preserve_emotion=preserve_emotion,
    )
    return {"job_id": job_id}


@router.get("/translate/stream/{job_id}")
def translate_stream(job_id: str) -> StreamingResponse:
    return StreamingResponse(translation_progress.sse_stream(job_id), media_type="text/event-stream")


@router.get("/translate/result/{job_id}")
def translate_result(job_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    status_payload = get_translation_status(job_store, job_id)
    if not status_payload:
        raise HTTPException(status_code=404, detail="job not found")
    progress = translation_progress.get_payload(job_id, include_logs=False)
    return {
        "job_id": job_id,
        "status": status_payload.get("status"),
        "result": status_payload.get("result"),
        "error": status_payload.get("error"),
        "progress": progress,
    }


@router.post("/download")
def model_download(job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    """Download and cache the translation model, streaming progress as SSE."""
    task_id = download_model(job_store)
    return StreamingResponse(translation_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/load")
def model_load() -> StreamingResponse:
    """Load the translation model into memory, streaming progress as SSE."""
    task_id = load_model()
    return StreamingResponse(translation_progress.sse_stream(task_id), media_type="text/event-stream")


@router.get("/status")
def model_status() -> dict:
    return get_model_status()


@router.post("/unload")
def model_unload() -> dict:
    return unload_model()
