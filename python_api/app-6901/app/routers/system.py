from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from python_api.common.logging import read_log_tail
from ..services.system import LOG_NAME, clear_temp_cache, create_log_stream, get_system_status


router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/status")
def status() -> dict:
    return get_system_status()


@router.get("/logs/tail")
def logs_tail(lines: int = 200) -> dict:
    return {"lines": read_log_tail(lines, log_name=LOG_NAME)}


@router.get("/logs/stream")
def logs_stream() -> StreamingResponse:
    return StreamingResponse(create_log_stream(LOG_NAME), media_type="text/event-stream")


@router.delete("/cache/temp")
def cache_clear() -> dict:
    return clear_temp_cache()
