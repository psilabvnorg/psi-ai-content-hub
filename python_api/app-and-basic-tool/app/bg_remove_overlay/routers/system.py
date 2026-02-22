from __future__ import annotations

import time

from fastapi import APIRouter

from ..services.remove_overlay import model_status


router = APIRouter(prefix="", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    return {
        "status": "ok",
        "uptime": time.time(),
        "models": {"background_removal": model_status()},
    }
