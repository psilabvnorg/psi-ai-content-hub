from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from python_api.common.paths import TEMP_DIR
from ..deps import get_job_store
from ..services.video import get_download_status, progress_store as video_progress, start_download
from ..services.tools_manager import aget_ffmpeg_bin_path_data
from python_api.common.jobs import JobStore


def _get_ffmpeg_cmd() -> str:
    """Return full path to ffmpeg, falling back to bare name."""
    ffmpeg_bin = aget_ffmpeg_bin_path_data()
    return str(ffmpeg_bin) if ffmpeg_bin else "ffmpeg"


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
    cmd = [_get_ffmpeg_cmd(), "-i", str(input_path), "-ss", start_time]
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
        [_get_ffmpeg_cmd(), "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)]
    )
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
    """Extract audio from an already-downloaded video file stored on the server.

    @param payload - Request body with file_id of the downloaded video and desired format.
    @return dict with status, filename, and download_url for the extracted audio.
    """
    if payload.format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="format must be mp3 or wav")
    file_record = job_store.get_file(payload.file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    input_path = file_record.path
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="File no longer exists on disk")
    output_path = input_path.with_suffix(f".audio.{payload.format}")
    codec = "libmp3lame" if payload.format == "mp3" else "pcm_s16le"
    subprocess.check_call(
        [_get_ffmpeg_cmd(), "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)]
    )
    audio_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{audio_record.file_id}"}


@router.post("/audio/convert")
def audio_convert(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if output_format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="output_format must be mp3 or wav")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(f".{output_format}")
    codec = "libmp3lame" if output_format == "mp3" else "pcm_s16le"
    subprocess.check_call([_get_ffmpeg_cmd(), "-i", str(input_path), "-acodec", codec, "-y", str(output_path)])
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
    if output_format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="output_format must be mp3 or wav")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(f".trimmed.{output_format}")
    codec = "libmp3lame" if output_format == "mp3" else "pcm_s16le"
    cmd = [_get_ffmpeg_cmd(), "-i", str(input_path), "-ss", start_time]
    if end_time:
        cmd.extend(["-to", end_time])
    cmd.extend(["-acodec", codec, "-vn", "-y", str(output_path)])
    subprocess.check_call(cmd)
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}"}


@router.post("/video/speed")
def video_speed(
    file: UploadFile = File(...),
    speed: float = Form(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if speed < 0.5 or speed > 2.0:
        raise HTTPException(status_code=400, detail="speed must be between 0.5 and 2.0")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(".speed.mp4")
    pts_multiplier = 1.0 / speed
    subprocess.check_call(
        [
            _get_ffmpeg_cmd(),
            "-i",
            str(input_path),
            "-filter:v",
            f"setpts={pts_multiplier}*PTS",
            "-filter:a",
            f"atempo={speed}",
            "-y",
            str(output_path),
        ]
    )
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/v1/files/{file_record.file_id}", "speed": speed}


UPSCAYL_MODELS = [
    "ultrasharp-4x",
    "remacri-4x",
    "ultramix-balanced-4x",
    "high-fidelity-4x",
    "digital-art-4x",
    "upscayl-standard-4x",
    "upscayl-lite-4x",
]

_UPSCAYL_DIR = Path(__file__).resolve().parent.parent / "upscale_image" / "resources"
_UPSCAYL_BIN = _UPSCAYL_DIR / "win" / "bin" / "upscayl-bin.exe"
_UPSCAYL_MODELS_DIR = _UPSCAYL_DIR / "models"


@router.get("/image/upscale/models")
def image_upscale_models() -> dict:
    """Return available upscaling models and whether the binary is found."""
    return {"models": UPSCAYL_MODELS, "binary_found": _UPSCAYL_BIN.exists()}


@router.post("/image/upscale")
def image_upscale(
    file: UploadFile = File(...),
    scale: int = Form(4),
    model_name: str = Form("ultrasharp-4x"),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if scale not in (2, 3, 4):
        raise HTTPException(status_code=400, detail="scale must be 2, 3, or 4")
    if model_name not in UPSCAYL_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model. Choose from: {', '.join(UPSCAYL_MODELS)}")
    if not _UPSCAYL_BIN.exists():
        raise HTTPException(status_code=500, detail="upscayl-bin not found. Check installation.")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(f".upscaled_{scale}x.png")
    cmd = [
        str(_UPSCAYL_BIN),
        "-i", str(input_path),
        "-o", str(output_path),
        "-m", str(_UPSCAYL_MODELS_DIR),
        "-n", model_name,
        "-s", str(scale),
        "-f", "png",
        "-c", "0",
    ]
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"Upscaling failed (exit code {exc.returncode})")
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Upscaling produced no output file")
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
