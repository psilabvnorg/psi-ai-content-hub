from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.thumbnail_batch import (
    a_get_thumbnail_batch_status_data,
    a_start_thumbnail_batch_job_data,
    a_thumbnail_batch_progress_store_data,
)


router = APIRouter(prefix="/api/v1/thumbnail", tags=["thumbnail"])


class a_thumbnail_batch_request_payload_data(BaseModel):
    template: dict[str, Any]
    rows: list[dict[str, Any]] = Field(default_factory=list)
    label_column: str | None = None


@router.post("/batch")
def a_thumbnail_batch_start_endpoint_data(
    a_payload_data: a_thumbnail_batch_request_payload_data,
    a_job_store_data: JobStore = Depends(get_job_store),
) -> dict[str, str]:
    if not isinstance(a_payload_data.template, dict) or not a_payload_data.template:
        raise HTTPException(status_code=400, detail="template is required")
    if not isinstance(a_payload_data.rows, list) or len(a_payload_data.rows) == 0:
        raise HTTPException(status_code=400, detail="rows is required")
    if any(not isinstance(a_row_data, dict) for a_row_data in a_payload_data.rows):
        raise HTTPException(status_code=400, detail="rows must be an array of objects")

    a_job_id_data = a_start_thumbnail_batch_job_data(
        a_job_store_data,
        a_payload_data.template,
        a_payload_data.rows,
        a_payload_data.label_column,
    )
    return {"job_id": a_job_id_data}


@router.get("/batch/stream/{job_id}")
def a_thumbnail_batch_stream_endpoint_data(job_id: str) -> StreamingResponse:
    return StreamingResponse(a_thumbnail_batch_progress_store_data.sse_stream(job_id), media_type="text/event-stream")


@router.get("/batch/status/{job_id}")
def a_thumbnail_batch_status_endpoint_data(
    job_id: str,
    a_job_store_data: JobStore = Depends(get_job_store),
) -> dict[str, Any]:
    a_status_payload_data = a_get_thumbnail_batch_status_data(a_job_store_data, job_id)
    if not a_status_payload_data:
        raise HTTPException(status_code=404, detail="job not found")
    return a_status_payload_data

