from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.paths import TEMP_DIR
from ..deps import get_job_store
from ..services.video import progress_store as video_progress, start_download
from python_api.common.jobs import JobStore


router = APIRouter(prefix="/api/v1", tags=["media"])


def _save_upload(file: UploadFile) -> Path:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    suffix = Path(file.filename).suffix or ".bin"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    target = TEMP_DIR / f"upload_{os.getpid()}_{file.filename}{suffix if not file.filename.endswith(suffix) else ''}"
    with target.open("wb") as handle:
        handle.write(file.file.read())
    return target


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
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(".trimmed.mp4")
    cmd = ["ffmpeg", "-i", str(input_path), "-ss", start_time]
    if end_time:
        cmd.extend(["-to", end_time])
    cmd.extend(["-c", "copy", "-y", str(output_path)])
    subprocess.check_call(cmd)
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.post("/video/extract-audio")
def video_extract_audio(
    file: UploadFile = File(...),
    format: str = Form("mp3"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="format must be mp3 or wav")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(f".{format}")
    codec = "libmp3lame" if format == "mp3" else "pcm_s16le"
    subprocess.check_call(
        ["ffmpeg", "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)]
    )
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}
