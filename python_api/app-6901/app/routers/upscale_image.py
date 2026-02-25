from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services.upscale_image.service import binary_found, get_models, upscale


router = APIRouter(tags=["upscale-image"])

_VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


@router.get("/models")
def upscale_models() -> dict:
    return {"models": get_models(), "binary_found": binary_found()}


@router.post("")
def upscale_image(
    file: UploadFile | None = File(default=None),
    scale: int = Form(default=4),
    model_name: str = Form(default="ultrasharp-4x"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None or not file.filename:
        raise HTTPException(status_code=400, detail="file is required")

    ext = Path(file.filename).suffix.lower()
    if ext not in _VALID_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Supported: {', '.join(sorted(_VALID_EXTS))}")

    if scale not in (2, 3, 4):
        raise HTTPException(status_code=400, detail="scale must be 2, 3, or 4")

    image_data = file.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="file is empty")

    if not binary_found():
        raise HTTPException(status_code=503, detail="upscayl-bin not found")

    try:
        output_path = upscale(image_data, file.filename, model_name, scale)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    stem = Path(file.filename).stem
    out_filename = f"{stem}_upscaled_{scale}x.png"
    record = job_store.add_file(output_path, out_filename)
    return {"download_url": f"/api/v1/files/{record.file_id}", "filename": out_filename}
