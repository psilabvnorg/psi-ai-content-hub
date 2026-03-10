from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services.image_border import process_image_border


router = APIRouter(tags=["image-border"])

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


@router.post("")
def image_border_process(
    file: UploadFile | None = File(default=None),
    thickness: int = Form(default=10),
    color: str = Form(default="#ffffff"),
    feather: int = Form(default=40),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None or not file.filename:
        raise HTTPException(status_code=400, detail="file is required")

    ext = Path(file.filename).suffix.lower()
    if ext != ".png":
        raise HTTPException(status_code=400, detail="Only PNG files with transparency are supported")

    if not (1 <= thickness <= 200):
        raise HTTPException(status_code=400, detail="thickness must be between 1 and 200")

    if not (0 <= feather <= 100):
        raise HTTPException(status_code=400, detail="feather must be between 0 and 100")

    if not _HEX_COLOR_RE.match(color):
        raise HTTPException(status_code=400, detail="color must be a 6-digit hex string e.g. #ffffff")

    image_data = file.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="file is empty")

    try:
        output_path = process_image_border(image_data, thickness, color, feather)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    stem = Path(file.filename).stem
    out_filename = f"{stem}_border.png"
    record = job_store.add_file(output_path, out_filename)
    return {"download_url": f"/api/v1/files/{record.file_id}", "filename": out_filename}
