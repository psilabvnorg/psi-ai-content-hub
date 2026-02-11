from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services.tools_manager import get_system_tools_status, install_tool, progress_store


router = APIRouter(prefix="/api/v1/tools", tags=["tools"])


@router.get("/status")
def tools_status() -> dict:
    return get_system_tools_status()


@router.post("/install")
def tools_install(payload: dict = Body(...)) -> StreamingResponse:
    tool_id = payload.get("id")
    if not tool_id:
        raise HTTPException(status_code=400, detail="id is required")
    task_id = install_tool(tool_id)
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")
