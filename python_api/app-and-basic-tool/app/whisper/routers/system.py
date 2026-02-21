from __future__ import annotations

import time

from fastapi import APIRouter

from ..services.stt import status as stt_status


router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    payload = stt_status()
    return {"status": "ok", "uptime": time.time(), "models": {"whisper": payload}}
