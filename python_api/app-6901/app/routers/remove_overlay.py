from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.remove_overlay import (
    SUPPORTED_AUDIO_EXTS,
    SUPPORTED_VIDEO_EXTS,
    get_overlay_result,
    get_result,
    get_video_overlay_result,
    get_video_result,
    model_status,
    overlay_image,
    overlay_image_upload,
    overlay_video,
    overlay_video_upload,
    process_upload,
    process_url,
    process_video_upload,
    process_video_url,
    progress_store,
    set_device,
    start_model_download,
    start_model_load,
    unload_model,
)


router = APIRouter(prefix="", tags=["bg-remove-overlay"])


@router.get("/status")
def bg_remove_status_route() -> dict:
    return {"models": {"background_removal": model_status()}}


# ---------------------------------------------------------------------------
# File download
# ---------------------------------------------------------------------------

def _guess_media_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".mp4":
        return "video/mp4"
    if suffix == ".avi":
        return "video/x-msvideo"
    if suffix == ".mov":
        return "video/quicktime"
    if suffix == ".mkv":
        return "video/x-matroska"
    if suffix == ".webm":
        return "video/webm"
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


# ---------------------------------------------------------------------------
# Image background removal
# ---------------------------------------------------------------------------

@router.post("/remove/upload")
def remove_background_upload(
    file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None:
        raise HTTPException(status_code=400, detail="file is required")
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    image_data = file.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="file is empty")
    task_id = process_upload(job_store, file.filename, image_data)
    return {"task_id": task_id}


@router.post("/remove/url")
def remove_background_url(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    url = str(payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    try:
        task_id = process_url(job_store, url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task_id": task_id}


@router.get("/remove/stream/{task_id}")
def remove_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/remove/result/{task_id}")
def remove_result(task_id: str) -> dict:
    payload = get_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.post("/remove/download")
def download_model_endpoint() -> dict:
    task_id = start_model_download()
    return {"status": "downloading", "task_id": task_id}


@router.post("/remove/load")
def load_model_endpoint() -> dict:
    task_id = start_model_load()
    return {"status": "loading", "task_id": task_id}


@router.post("/remove/unload")
def unload_model_endpoint() -> dict:
    return unload_model()


@router.post("/remove/set-device")
def set_device_endpoint(payload: dict = Body(...)) -> dict:
    device = str(payload.get("device") or "").strip()
    if device not in ("cuda", "cpu"):
        raise HTTPException(status_code=400, detail="device must be 'cuda' or 'cpu'")
    try:
        return set_device(device)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Video background removal
# ---------------------------------------------------------------------------

@router.post("/video/upload")
def remove_background_video_upload(
    file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if file is None or not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_VIDEO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format. Supported: {', '.join(sorted(SUPPORTED_VIDEO_EXTS))}",
        )
    video_data = file.file.read()
    if not video_data:
        raise HTTPException(status_code=400, detail="file is empty")
    task_id = process_video_upload(job_store, file.filename, video_data)
    return {"task_id": task_id}


@router.post("/video/url")
def remove_background_video_url(
    payload: dict = Body(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    url = str(payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    try:
        task_id = process_video_url(job_store, url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task_id": task_id}


@router.get("/video/stream/{task_id}")
def video_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/video/result/{task_id}")
def video_result(task_id: str) -> dict:
    payload = get_video_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


# ---------------------------------------------------------------------------
# Overlay endpoints
# ---------------------------------------------------------------------------

@router.post("/remove/overlay")
def image_overlay_endpoint(
    bg_file: UploadFile | None = File(default=None),
    processed_file_id: str = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if bg_file is None or not bg_file.filename:
        raise HTTPException(status_code=400, detail="bg_file is required")
    bg_data = bg_file.file.read()
    if not bg_data:
        raise HTTPException(status_code=400, detail="bg_file is empty")
    task_id = overlay_image(job_store, processed_file_id, bg_data, bg_file.filename)
    return {"task_id": task_id}


@router.get("/remove/overlay/stream/{task_id}")
def image_overlay_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/remove/overlay/result/{task_id}")
def image_overlay_result(task_id: str) -> dict:
    payload = get_overlay_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.post("/video/overlay")
def video_overlay_endpoint(
    bg_file: UploadFile | None = File(default=None),
    subject_file_id: str = Form(...),
    mask_file_id: str = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if bg_file is None or not bg_file.filename:
        raise HTTPException(status_code=400, detail="bg_file is required")
    bg_data = bg_file.file.read()
    if not bg_data:
        raise HTTPException(status_code=400, detail="bg_file is empty")
    task_id = overlay_video(job_store, subject_file_id, mask_file_id, bg_data, bg_file.filename)
    return {"task_id": task_id}


@router.get("/video/overlay/stream/{task_id}")
def video_overlay_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/video/overlay/result/{task_id}")
def video_overlay_result_endpoint(task_id: str) -> dict:
    payload = get_video_overlay_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


# ---------------------------------------------------------------------------
# Standalone overlay — direct file uploads
# ---------------------------------------------------------------------------

@router.post("/remove/overlay/upload")
def image_overlay_upload_endpoint(
    fg_file: UploadFile | None = File(default=None),
    bg_file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if fg_file is None or not fg_file.filename:
        raise HTTPException(status_code=400, detail="fg_file is required")
    if bg_file is None or not bg_file.filename:
        raise HTTPException(status_code=400, detail="bg_file is required")
    fg_data = fg_file.file.read()
    bg_data = bg_file.file.read()
    if not fg_data:
        raise HTTPException(status_code=400, detail="fg_file is empty")
    if not bg_data:
        raise HTTPException(status_code=400, detail="bg_file is empty")
    task_id = overlay_image_upload(job_store, fg_data, fg_file.filename, bg_data, bg_file.filename)
    return {"task_id": task_id}


@router.post("/video/overlay/upload")
def video_overlay_upload_endpoint(
    subject_file: UploadFile | None = File(default=None),
    mask_file: UploadFile | None = File(default=None),
    bg_file: UploadFile | None = File(default=None),
    audio_file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if subject_file is None or not subject_file.filename:
        raise HTTPException(status_code=400, detail="subject_file is required")
    if bg_file is None or not bg_file.filename:
        raise HTTPException(status_code=400, detail="bg_file is required")
    subject_ext = Path(subject_file.filename).suffix.lower()
    if subject_ext not in SUPPORTED_VIDEO_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported subject video format. Supported: {', '.join(sorted(SUPPORTED_VIDEO_EXTS))}")
    if audio_file and audio_file.filename:
        audio_ext = Path(audio_file.filename).suffix.lower()
        if audio_ext not in SUPPORTED_AUDIO_EXTS:
            raise HTTPException(status_code=400, detail=f"Unsupported audio format. Supported: {', '.join(sorted(SUPPORTED_AUDIO_EXTS))}")
    subject_data = subject_file.file.read()
    mask_data = mask_file.file.read() if mask_file and mask_file.filename else None
    mask_filename = mask_file.filename if mask_file and mask_file.filename else None
    bg_data = bg_file.file.read()
    audio_data = audio_file.file.read() if audio_file and audio_file.filename else None
    audio_filename = audio_file.filename if audio_file and audio_file.filename else None
    if not subject_data:
        raise HTTPException(status_code=400, detail="subject_file is empty")
    if not bg_data:
        raise HTTPException(status_code=400, detail="bg_file is empty")
    task_id = overlay_video_upload(
        job_store, subject_data, subject_file.filename,
        mask_data, mask_filename, bg_data, bg_file.filename,
        audio_data, audio_filename,
    )
    return {"task_id": task_id}
