from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from ..deps import get_job_store
from ..services.audio import compress_audio, convert_audio, normalize_audio
from ..services.jobs import JobStore
from ..services.stt import download_model as stt_download_model
from ..services.stt import progress_store as stt_progress
from ..services.stt import status as stt_status
from ..services.stt import transcribe as stt_transcribe
from ..services.tts import download_model as tts_download_model
from ..services.tts import generate as tts_generate
from ..services.tts import get_model_configs, get_voices
from ..services.tts import load_model as tts_load_model
from ..services.tts import get_download_file_id as tts_download_file_id
from ..services.tts import progress_store as tts_progress
from ..services.video import get_download_status, progress_store as video_progress, start_download
from ..services.voice_clone import download_model as vc_download_model
from ..services.voice_clone import generate as vc_generate
from ..services.voice_clone import list_samples, list_voices
from ..services.voice_clone import get_download_file_id as vc_download_file_id
from ..services.voice_clone import progress_store as vc_progress
from ..settings import TEMP_DIR


router = APIRouter(prefix="/api/tools", tags=["tools"])


def _save_upload(file: UploadFile) -> Path:
    if not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    suffix = Path(file.filename).suffix or ".bin"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    target = TEMP_DIR / f"upload_{os.getpid()}_{file.filename}"
    with target.open("wb") as handle:
        handle.write(file.file.read())
    return target


@router.post("/video/download")
def video_download(
    payload: dict = Body(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    url = payload.get("url")
    platform = payload.get("platform")
    convert_to_h264 = bool(payload.get("convert_to_h264", False))
    if not url or not platform:
        raise HTTPException(status_code=400, detail="url and platform are required")
    job_id = start_download(job_store, url, platform, convert_to_h264)
    return {"job_id": job_id}


@router.get("/video/download/status/{job_id}")
def video_download_status(job_id: str, job_store: JobStore = Depends(get_job_store)) -> JSONResponse:
    data = get_download_status(job_store, job_id)
    if not data:
        raise HTTPException(status_code=404, detail="job not found")
    progress = video_progress.get_payload(job_id, include_logs=True)
    if progress:
        data["progress"] = progress
    return JSONResponse(data)


@router.delete("/video/cache")
def video_cache_clear() -> dict:
    removed = 0
    for item in TEMP_DIR.iterdir():
        if item.is_file():
            try:
                item.unlink()
                removed += 1
            except Exception:
                pass
    return {"status": "success", "removed": removed}


@router.post("/video/extract-audio")
def video_extract_audio(file: UploadFile = File(...), format: str = Form("mp3"), job_store: JobStore = Depends(get_job_store)) -> dict:
    if format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="format must be mp3 or wav")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(f".{format}")
    codec = "libmp3lame" if format == "mp3" else "pcm_s16le"
    subprocess.check_call(["ffmpeg", "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)])
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/download/{file_record.file_id}"}


@router.post("/audio/convert")
def audio_convert(file: UploadFile = File(...), output_format: str = Form(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    if output_format not in ("mp3", "wav"):
        raise HTTPException(status_code=400, detail="output_format must be mp3 or wav")
    input_path = _save_upload(file)
    return convert_audio(job_store, input_path, output_format)


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
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/download/{file_record.file_id}"}


@router.post("/video/speed")
def video_speed(file: UploadFile = File(...), speed: float = Form(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    if speed < 0.5 or speed > 2.0:
        raise HTTPException(status_code=400, detail="speed must be between 0.5 and 2.0")
    input_path = _save_upload(file)
    output_path = input_path.with_suffix(".speed.mp4")
    pts = 1.0 / speed
    subprocess.check_call(
        [
            "ffmpeg",
            "-i",
            str(input_path),
            "-filter:v",
            f"setpts={pts}*PTS",
            "-filter:a",
            f"atempo={speed}",
            "-y",
            str(output_path),
        ]
    )
    file_record = job_store.add_file(output_path, output_path.name)
    return {"status": "success", "filename": output_path.name, "download_url": f"/api/download/{file_record.file_id}"}


@router.post("/video/metadata")
def video_metadata(file: UploadFile = File(...)) -> dict:
    input_path = _save_upload(file)
    output = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-print_format", "json", str(input_path)],
        text=True,
    )
    return {"status": "success", "metadata": json.loads(output)}


@router.post("/audio/normalize")
def audio_normalize(file: UploadFile = File(...), target_lufs: Optional[float] = Form(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    input_path = _save_upload(file)
    return normalize_audio(job_store, input_path, target_lufs)


@router.post("/audio/compress")
def audio_compress(file: UploadFile = File(...), bitrate: Optional[str] = Form(None), job_store: JobStore = Depends(get_job_store)) -> dict:
    input_path = _save_upload(file)
    return compress_audio(job_store, input_path, bitrate)


@router.post("/thumbnail/create")
def thumbnail_create(
    title: str = Form(...),
    description: str = Form(...),
    file: Optional[UploadFile] = File(None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    placeholder = TEMP_DIR / f"thumbnail_{os.getpid()}.txt"
    placeholder.write_text(f"Thumbnail placeholder\\n{title}\\n{description}\\n", encoding="utf-8")
    file_record = job_store.add_file(placeholder, placeholder.name)
    return {"status": "success", "filename": placeholder.name, "download_url": f"/api/download/{file_record.file_id}"}


@router.get("/tts/voices")
def tts_voices() -> dict:
    return get_voices()


@router.get("/tts/model/configs")
def tts_model_configs() -> dict:
    return get_model_configs()


@router.post("/tts/model/download")
def tts_model_download(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    backbone = payload.get("backbone")
    codec = payload.get("codec")
    if not backbone or not codec:
        raise HTTPException(status_code=400, detail="backbone and codec are required")
    task_id = tts_download_model(job_store, backbone, codec)
    return StreamingResponse(tts_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/tts/model/load")
def tts_model_load(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    backbone = payload.get("backbone")
    codec = payload.get("codec")
    device = payload.get("device", "auto")
    if not backbone or not codec:
        raise HTTPException(status_code=400, detail="backbone and codec are required")
    task_id = tts_load_model(job_store, backbone, codec, device)
    return StreamingResponse(tts_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/tts/generate")
def tts_generate_route(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    text = (payload.get("text") or "").strip()
    mode = payload.get("mode", "preset")
    voice_id = payload.get("voice_id")
    sample_voice_id = payload.get("sample_voice_id")
    sample_text_id = payload.get("sample_text_id")
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    task_id = tts_generate(job_store, text, mode, voice_id, sample_voice_id, sample_text_id)
    return {"task_id": task_id}


@router.get("/tts/progress/{task_id}")
def tts_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(tts_progress.sse_stream(task_id), media_type="text/event-stream")


@router.get("/tts/download/{task_id}")
def tts_download(task_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    file_id = tts_download_file_id(task_id)
    if not file_id:
        raise HTTPException(status_code=404, detail="file not ready")
    record = job_store.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="file not found")
    return {"status": "success", "filename": record.filename, "download_url": f"/api/download/{file_id}"}


@router.get("/voice-clone/voices")
def voice_clone_voices() -> dict:
    return list_voices()


@router.get("/voice-clone/samples")
def voice_clone_samples() -> dict:
    return list_samples()


@router.post("/voice-clone/model")
def voice_clone_model(job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    task_id = vc_download_model(job_store)
    return StreamingResponse(vc_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/voice-clone/generate")
def voice_clone_generate(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    voice_id = payload.get("voice_id")
    text = (payload.get("text") or "").strip()
    speed = float(payload.get("speed", 1.0))
    cfg_strength = float(payload.get("cfg_strength", 2.0))
    nfe_step = int(payload.get("nfe_step", 32))
    remove_silence = bool(payload.get("remove_silence", False))
    if not voice_id or not text:
        raise HTTPException(status_code=400, detail="voice_id and text are required")
    task_id = vc_generate(job_store, voice_id, text, speed, cfg_strength, nfe_step, remove_silence)
    return {"task_id": task_id}


@router.get("/voice-clone/progress/{task_id}")
def voice_clone_progress(task_id: str) -> StreamingResponse:
    return StreamingResponse(vc_progress.sse_stream(task_id), media_type="text/event-stream")


@router.get("/voice-clone/download/{task_id}")
def voice_clone_download(task_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    file_id = vc_download_file_id(task_id)
    if not file_id:
        raise HTTPException(status_code=404, detail="file not ready")
    record = job_store.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="file not found")
    return {"status": "success", "filename": record.filename, "download_url": f"/api/download/{file_id}"}


@router.get("/stt/status")
def stt_status_route() -> dict:
    return stt_status()


@router.post("/stt/model/download")
def stt_model_download(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> StreamingResponse:
    model = payload.get("model", "base")
    task_id = stt_download_model(job_store, model)
    return StreamingResponse(stt_progress.sse_stream(task_id), media_type="text/event-stream")


@router.post("/stt/transcribe")
def stt_transcribe_route(
    file: UploadFile = File(...),
    model: str = Form("base"),
    language: Optional[str] = Form("vi"),
    add_punctuation: bool = Form(True),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    input_path = _save_upload(file)
    task_id = stt_transcribe(job_store, input_path, model, language, add_punctuation)
    return {"task_id": task_id}


@router.get("/stt/progress/{task_id}")
def stt_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(stt_progress.sse_stream(task_id), media_type="text/event-stream")


@router.get("/stt/result/{task_id}")
def stt_result(task_id: str) -> dict:
    from ..services.stt import get_result

    payload = get_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="task not found")
    return payload
