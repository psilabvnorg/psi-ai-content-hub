from __future__ import annotations

import time

from fastapi import APIRouter

from ..services.voice_clone import model_status_all


router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    all_models = model_status_all()
    return {
        "status": "ok",
        "uptime": time.time(),
        "models": {
            "f5_tts": all_models["vi"],      # backward compat
            "f5_tts_vn": all_models["vi"],
            "f5_tts_en": all_models["en"],
        },
    }
