from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from ..deps import get_job_store
from python_api.common.jobs import JobStore


router = APIRouter(prefix="/api/v1", tags=["files"])


@router.get("/files/{file_id}")
def download(file_id: str, job_store: JobStore = Depends(get_job_store)) -> Response:
    record = job_store.get_file(file_id)
    if not record or not record.path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=record.path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={record.filename}"},
    )
