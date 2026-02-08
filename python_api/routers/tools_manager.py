from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services.tools_manager import get_manager_status, install_tool, progress_store


router = APIRouter(prefix="/api/tools/manager", tags=["tools-manager"])


@router.get("/status")
def manager_status() -> list[dict]:
    return get_manager_status()


@router.post("/install")
def manager_install(payload: dict = Body(...)) -> StreamingResponse:
    tool_id = payload.get("id")
    if not tool_id:
        raise HTTPException(status_code=400, detail="id is required")
    task_id = install_tool(tool_id)
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")
