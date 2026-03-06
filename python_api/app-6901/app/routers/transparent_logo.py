from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services.transparent_logo import process_transparent_logo


router = APIRouter(tags=["transparent-logo"])

_VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


@router.post("")
def thumbnail_simple_process(
    file: UploadFile | None = File(default=None),
    tolerance: int = Form(default=1),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None or not file.filename:
        raise HTTPException(status_code=400, detail="file is required")

    ext = Path(file.filename).suffix.lower()
    if ext not in _VALID_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Supported: {', '.join(sorted(_VALID_EXTS))}",
        )

    if not (0 <= tolerance <= 255):
        raise HTTPException(status_code=400, detail="tolerance must be between 0 and 255")

    image_data = file.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="file is empty")

    try:
        output_path = process_transparent_logo(image_data, tolerance)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    stem = Path(file.filename).stem
    out_filename = f"{stem}_transparent.png"
    record = job_store.add_file(output_path, out_filename)
    return {"download_url": f"/api/v1/files/{record.file_id}", "filename": out_filename}
