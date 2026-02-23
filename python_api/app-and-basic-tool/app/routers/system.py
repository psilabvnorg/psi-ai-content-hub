from __future__ import annotations

import json
import time
from typing import Iterable

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from python_api.common.logging import read_log_tail, stream_log_lines
from python_api.common.paths import BASE_APP_DIR, MODEL_ROOT, TEMP_DIR
from ..services.tools_manager import get_system_tools_status


LOG_NAME = "app-service.log"

router = APIRouter(prefix="/api/v1", tags=["system"])


def _temp_stats() -> dict:
    total = 0
    file_count = 0
    try:
        for item in TEMP_DIR.iterdir():
            if item.is_file():
                file_count += 1
                total += item.stat().st_size
    except Exception:
        pass
    return {"temp_dir": str(TEMP_DIR), "file_count": file_count, "total_size_mb": round(total / (1024 * 1024), 2)}


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    tools_status = get_system_tools_status()
    return {
        "status": "ok",
        "uptime": time.time(),
        "base_app_dir": str(BASE_APP_DIR),
        "temp": _temp_stats(),
        "tools": tools_status,
        "models": {"shared_root": str(MODEL_ROOT)},
    }


@router.get("/logs/tail")
def logs_tail(lines: int = 200) -> dict:
    return {"lines": read_log_tail(lines, log_name=LOG_NAME)}


def _log_stream() -> Iterable[str]:
    for line in stream_log_lines(log_name=LOG_NAME):
        if not line:
            time.sleep(0.2)
            continue
        yield f"data: {json.dumps({'line': line})}\n\n"


@router.get("/logs/stream")
def logs_stream() -> StreamingResponse:
    return StreamingResponse(_log_stream(), media_type="text/event-stream")


@router.delete("/cache/temp")
def cache_clear() -> dict:
    removed = 0
    for item in TEMP_DIR.iterdir():
        if item.is_file():
            try:
                item.unlink()
                removed += 1
            except Exception:
                pass
    return {"status": "success", "removed": removed}
