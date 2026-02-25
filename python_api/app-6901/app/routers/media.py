from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services import media as media_service
from ..services.video import get_download_status, progress_store as video_progress, start_download


router = APIRouter(prefix="/api/v1", tags=["media"])


@router.post("/video/download")
def video_download(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    url = payload.get("url")
    platform = payload.get("platform")
    convert_to_h264 = bool(payload.get("convert_to_h264", False))
    if not url or not platform:
        raise HTTPException(status_code=400, detail="url and platform are required")
    job_id = start_download(job_store, url, platform, convert_to_h264)
    return {"job_id": job_id}


@router.get("/video/download/stream/{job_id}")
def video_download_stream(job_id: str) -> StreamingResponse:
    return StreamingResponse(video_progress.sse_stream(job_id), media_type="text/event-stream")


@router.post("/video/trim")
def video_trim(
    file: UploadFile = File(...),
    start_time: str = Form(...),
    end_time: Optional[str] = Form(None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    input_path = media_service.save_upload(file.filename, file.file.read())
    output_path = media_service.trim_video(input_path, start_time, end_time)
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.post("/video/extract-audio")
def video_extract_audio(
    file: UploadFile = File(...),
    format: str = Form("mp3"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    try:
        input_path = media_service.save_upload(file.filename, file.file.read())
        output_path = media_service.extract_audio(input_path, format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


class ExtractAudioFromFileIdRequest(BaseModel):
    file_id: str
    format: str = "mp3"


@router.post("/video/extract-audio-from-fileid")
def video_extract_audio_from_fileid(
    payload: ExtractAudioFromFileIdRequest,
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    """Extract audio from an already-downloaded video file stored on the server."""
    file_record = job_store.get_file(payload.file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        output_path = media_service.extract_audio_from_path(file_record.path, payload.format, ".audio")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    audio_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{audio_record.file_id}"}


@router.post("/audio/convert")
def audio_convert(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    try:
        input_path = media_service.save_upload(file.filename, file.file.read())
        output_path = media_service.convert_audio(input_path, output_format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.post("/audio/trim")
def audio_trim(
    file: UploadFile = File(...),
    start_time: str = Form(...),
    end_time: Optional[str] = Form(None),
    output_format: str = Form("mp3"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    try:
        input_path = media_service.save_upload(file.filename, file.file.read())
        output_path = media_service.trim_audio(input_path, start_time, end_time, output_format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.post("/video/speed")
def video_speed(
    file: UploadFile = File(...),
    speed: float = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    try:
        input_path = media_service.save_upload(file.filename, file.file.read())
        output_path = media_service.adjust_video_speed(input_path, speed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}", "speed": speed}


@router.get("/image/upscale/models")
def image_upscale_models() -> dict:
    return {"models": media_service.get_upscayl_models(), "binary_found": media_service.is_upscayl_binary_found()}


@router.post("/image/upscale")
def image_upscale(
    file: UploadFile = File(...),
    scale: int = Form(4),
    model_name: str = Form("ultrasharp-4x"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    try:
        input_path = media_service.save_upload(file.filename, file.file.read())
        output_path = media_service.upscale_image(input_path, model_name, scale)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.get("/video/download/status/{job_id}")
def video_download_status(job_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    record = get_download_status(job_store, job_id)
    if not record:
        raise HTTPException(status_code=404, detail="job not found")
    progress = video_progress.get_payload(job_id, include_logs=False)
    return {
        "job_id": job_id,
        "status": record.get("status"),
        "result": record.get("result"),
        "error": record.get("error"),
        "progress": progress,
    }
