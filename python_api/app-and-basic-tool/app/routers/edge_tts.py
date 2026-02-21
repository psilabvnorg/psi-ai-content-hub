from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services import edge_tts as edge_tts_service


router = APIRouter(prefix="/api/v1/edge-tts", tags=["edge-tts"])


class GenerateEdgeTtsRequest(BaseModel):
    text: str
    voice: str
    rate: int = 0
    pitch: int = 0


@router.get("/languages")
async def get_languages() -> dict:
    try:
        languages = await edge_tts_service.list_languages()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"languages": languages}


@router.get("/voices")
async def get_voices(language: Optional[str] = Query(default=None, alias="language")) -> dict:
    try:
        voices = await edge_tts_service.list_voices(language=language)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"voices": voices}


@router.post("/generate")
async def generate(
    payload: GenerateEdgeTtsRequest,
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    text = payload.text.strip()
    voice = payload.voice.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if not voice:
        raise HTTPException(status_code=400, detail="voice is required")

    try:
        available_voices = await edge_tts_service.list_voices()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    available_voice_ids = {item["id"] for item in available_voices}
    if voice not in available_voice_ids:
        raise HTTPException(status_code=400, detail="voice is not supported")

    try:
        output_path, filename = await edge_tts_service.synthesize_to_mp3(
            text=text,
            voice=voice,
            rate=payload.rate,
            pitch=payload.pitch,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - runtime synthesis errors
        raise HTTPException(status_code=500, detail=f"edge-tts generation failed: {exc}") from exc

    file_record = job_store.add_file(output_path, filename)
    return {
        "status": "success",
        "file_id": file_record.file_id,
        "filename": filename,
        "download_url": f"/api/v1/files/{file_record.file_id}",
    }
