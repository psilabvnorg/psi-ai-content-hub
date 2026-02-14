from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store


router = APIRouter(prefix="/api/v1", tags=["files"])


def _guess_media_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


@router.get("/files/{file_id}")
def download(
    file_id: str,
    download: bool = Query(default=False),
    job_store: JobStore = Depends(get_job_store),
) -> FileResponse:
    record = job_store.get_file(file_id)
    if not record or not record.path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=record.path,
        media_type=_guess_media_type(record.path),
        filename=record.filename if download else None,
    )
