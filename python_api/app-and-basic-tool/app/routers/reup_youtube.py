from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse

import httpx

from ..deps import get_job_store
from ..services.reup_youtube import (
    get_result,
    progress_store,
    start_pipeline,
)
from python_api.common.jobs import JobStore


router = APIRouter(prefix="/api/v1/reup-youtube", tags=["reup-youtube"])

_F5_TTS_BASE = "http://127.0.0.1:6902/api/v1"

_SUPPORTED_LANGUAGES = {"en", "ja", "vi", "de"}
_WHISPER_MODELS = {"tiny", "base", "small", "medium", "large", "large-v2", "large-v3"}


@router.post("/start")
def pipeline_start(
    payload: dict = Body(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    """
    Start the reup-youtube pipeline.

    Body fields:
      - youtube_url      (str, required)  – YouTube video URL
      - target_language  (str, required)  – "en" | "ja" | "vi" | "de"
      - voice_id         (str, required)  – F5-TTS voice identifier
      - whisper_model    (str, optional)  – default "medium"
      - image_sources    (list, optional) – list of source ids; null = all
      - number_of_images (int, optional)  – default 5
      - llm_model        (str, optional)  – Ollama model for keyword gen, default "deepseek-r1:8b"
    """
    youtube_url: str = (payload.get("youtube_url") or "").strip()
    target_language: str = (payload.get("target_language") or "en").strip().lower()
    voice_id: str = (payload.get("voice_id") or "").strip()
    whisper_model: str = (payload.get("whisper_model") or "medium").strip()
    image_sources = payload.get("image_sources")
    number_of_images = int(payload.get("number_of_images") or 5)
    llm_model: str = (payload.get("llm_model") or "deepseek-r1:8b").strip()

    if not youtube_url:
        raise HTTPException(status_code=400, detail="youtube_url is required")
    if target_language not in _SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"target_language must be one of {sorted(_SUPPORTED_LANGUAGES)}",
        )
    if not voice_id:
        raise HTTPException(status_code=400, detail="voice_id is required")
    if whisper_model not in _WHISPER_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"whisper_model must be one of {sorted(_WHISPER_MODELS)}",
        )
    number_of_images = max(1, min(20, number_of_images))

    pipeline_id = start_pipeline(
        job_store=job_store,
        youtube_url=youtube_url,
        target_language=target_language,
        whisper_model=whisper_model,
        voice_id=voice_id,
        image_sources=image_sources if isinstance(image_sources, list) else None,
        number_of_images=number_of_images,
        llm_model=llm_model,
    )
    return {"pipeline_id": pipeline_id}


@router.get("/stream/{pipeline_id}")
def pipeline_stream(pipeline_id: str) -> StreamingResponse:
    """SSE stream for pipeline progress."""
    return StreamingResponse(
        progress_store.sse_stream(pipeline_id),
        media_type="text/event-stream",
    )


@router.get("/result/{pipeline_id}")
def pipeline_result(pipeline_id: str) -> dict:
    """Return the final pipeline result once complete."""
    result = get_result(pipeline_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Pipeline result not ready or not found")
    return result


@router.get("/voices")
def list_voices() -> dict:
    """Proxy the F5-TTS voices list from port 6902."""
    try:
        resp = httpx.get(f"{_F5_TTS_BASE}/voices", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"F5-TTS service unavailable: {exc}",
        )
