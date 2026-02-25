from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services.files import get_file_download


router = APIRouter(prefix="/api/v1", tags=["files"])


@router.get("/files/{file_id}")
def download(file_id: str, job_store: JobStore = Depends(get_job_store)) -> Response:
    try:
        content, filename = get_file_download(job_store, file_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
