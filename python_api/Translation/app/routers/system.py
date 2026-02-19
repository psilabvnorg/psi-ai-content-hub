from __future__ import annotations

import time

from fastapi import APIRouter

from ..services.translation import get_model_status


router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    payload = get_model_status()
    return {"status": "ok", "uptime": time.time(), "models": {"translation": payload}}
