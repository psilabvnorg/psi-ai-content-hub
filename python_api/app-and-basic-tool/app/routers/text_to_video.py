from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.text_to_video import (
    UploadedImageData,
    audio_progress_store,
    get_audio_result,
    get_render_result,
    get_studio_status,
    render_progress_store,
    stage_preview,
    start_audio_pipeline,
    start_render_pipeline,
    start_studio,
)


router = APIRouter(prefix="/api/v1/text-to-video", tags=["text-to-video"])


def _to_uploaded_image(upload: UploadFile | None, field_name: str) -> UploadedImageData:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
    return UploadedImageData(filename=upload.filename, content_type=upload.content_type, data=data)


@router.post("/audio")
def create_audio_task(payload: dict = Body(...), job_store: JobStore = Depends(get_job_store)) -> dict:
    text = str(payload.get("text") or "").strip()
    voice_id = str(payload.get("voice_id") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if not voice_id:
        raise HTTPException(status_code=400, detail="voice_id is required")
    task_id = start_audio_pipeline(job_store, text=text, voice_id=voice_id)
    return {"task_id": task_id}


@router.get("/audio/stream/{task_id}")
def audio_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(audio_progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/audio/result/{task_id}")
def audio_result(task_id: str) -> dict:
    payload = get_audio_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.post("/render")
def create_render_task(
    session_id: str = Form(...),
    orientation: Literal["vertical", "horizontal"] = Form(...),
    intro_config_json: str = Form(...),
    intro_image: UploadFile | None = File(default=None),
    images: list[UploadFile] = File(default=[]),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    clean_session_id = session_id.strip()
    if not clean_session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    if len(images) < 1 or len(images) > 10:
        raise HTTPException(status_code=400, detail="images must contain between 1 and 10 files")

    try:
        parsed_intro_config = json.loads(intro_config_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="intro_config_json is invalid JSON") from exc
    if not isinstance(parsed_intro_config, dict):
        raise HTTPException(status_code=400, detail="intro_config_json must be a JSON object")

    intro_upload = _to_uploaded_image(intro_image, "intro_image")
    image_uploads = [_to_uploaded_image(image, "images") for image in images]

    try:
        task_id = start_render_pipeline(
            job_store=job_store,
            session_id=clean_session_id,
            orientation=orientation,
            intro_image=intro_upload,
            images=image_uploads,
            intro_config=parsed_intro_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"task_id": task_id}


@router.get("/render/stream/{task_id}")
def render_progress_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(render_progress_store.sse_stream(task_id), media_type="text/event-stream")


@router.get("/render/result/{task_id}")
def render_result(task_id: str) -> dict:
    payload = get_render_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.post("/preview/stage")
def create_preview(
    session_id: str = Form(...),
    orientation: Literal["vertical", "horizontal"] = Form(...),
    intro_config_json: str = Form(...),
    intro_image: UploadFile | None = File(default=None),
    images: list[UploadFile] = File(default=[]),
) -> dict:
    clean_session_id = session_id.strip()
    if not clean_session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if len(images) < 1 or len(images) > 10:
        raise HTTPException(status_code=400, detail="images must contain between 1 and 10 files")

    try:
        parsed_intro_config = json.loads(intro_config_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="intro_config_json is invalid JSON") from exc
    if not isinstance(parsed_intro_config, dict):
        raise HTTPException(status_code=400, detail="intro_config_json must be a JSON object")

    intro_upload = _to_uploaded_image(intro_image, "intro_image")
    image_uploads = [_to_uploaded_image(image, "images") for image in images]

    try:
        result = stage_preview(
            session_id=clean_session_id,
            orientation=orientation,
            intro_image=intro_upload,
            images=image_uploads,
            intro_config=parsed_intro_config,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.post("/preview/studio/start")
def start_preview_studio() -> dict:
    try:
        return start_studio()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/preview/studio/status")
def preview_studio_status() -> dict:
    return get_studio_status()
