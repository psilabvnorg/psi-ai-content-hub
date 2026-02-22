from __future__ import annotations

import tempfile
import time
from pathlib import Path

from fastapi import APIRouter


router = APIRouter(prefix="", tags=["system"])

IMAGE_FINDER_TEMP_ROOT = Path(tempfile.gettempdir()) / "psi_ai_content_hub" / "image_finder"


def _temp_stats() -> dict:
    total = 0
    file_count = 0
    try:
        if IMAGE_FINDER_TEMP_ROOT.exists():
            for item in IMAGE_FINDER_TEMP_ROOT.rglob("*"):
                if item.is_file():
                    file_count += 1
                    total += item.stat().st_size
    except Exception:
        pass
    return {
        "temp_dir": str(IMAGE_FINDER_TEMP_ROOT),
        "file_count": file_count,
        "total_size_mb": round(total / (1024 * 1024), 2),
    }


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    return {"status": "ok", "uptime": time.time(), "temp": _temp_stats()}

