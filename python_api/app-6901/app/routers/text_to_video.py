from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.text_to_video import (
    UploadedArtifactData,
    UploadedImageData,
    audio_progress_store,
    create_audio_session_from_upload,
    get_audio_result,
    get_render_result,
    get_remotion_setup_status,
    get_studio_status,
    get_video_config,
    render_progress_store,
    setup_progress_store,
    stage_preview,
    start_audio_pipeline,
    start_render_pipeline,
    start_remotion_deps_install,
    start_studio,
    stop_studio,
    generate_new_template,
    update_template,
    update_video_config,
    upload_template_asset,
)


router = APIRouter(prefix="/api/v1/text-to-video", tags=["text-to-video"])


def _to_uploaded_image(upload: UploadFile | None, field_name: str) -> UploadedImageData:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
    return UploadedImageData(filename=upload.filename, content_type=upload.content_type, data=data)


def _to_uploaded_artifact(upload: UploadFile | None, field_name: str) -> UploadedArtifactData:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
    return UploadedArtifactData(filename=upload.filename, content_type=upload.content_type, data=data)


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


@router.post("/audio/upload")
def upload_audio_artifacts(
    audio_file: UploadFile | None = File(default=None),
    transcript_file: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    audio_upload = _to_uploaded_artifact(audio_file, "audio_file")
    transcript_upload = _to_uploaded_artifact(transcript_file, "transcript_file")

    try:
        return create_audio_session_from_upload(
            job_store=job_store,
            audio_upload=audio_upload,
            transcript_upload=transcript_upload,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.post("/template/upload-asset")
def upload_template_asset_endpoint(
    subfolder: str = Form(...),
    target_filename: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="file is required")
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="file is empty")
    try:
        saved_name = upload_template_asset(subfolder, file.filename, data, target_filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"subfolder": subfolder, "filename": saved_name}


@router.get("/video-config")
def get_video_config_endpoint() -> dict:
    return get_video_config()


@router.patch("/video-config")
def update_video_config_endpoint(payload: dict = Body(...)) -> dict:
    try:
        return update_video_config(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/template/update")
def update_template_endpoint(payload: dict = Body(default={})) -> dict:
    template_id = str(payload.get("template_id", "template_2"))
    try:
        return update_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/preview/studio/start")
def start_preview_studio() -> dict:
    try:
        return start_studio()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/preview/studio/status")
def preview_studio_status() -> dict:
    return get_studio_status()


@router.post("/preview/studio/stop")
def stop_preview_studio() -> dict:
    return stop_studio()


@router.get("/setup/status")
def remotion_setup_status() -> dict:
    return get_remotion_setup_status()


@router.post("/setup/install-deps")
def remotion_install_deps() -> StreamingResponse:
    task_id = start_remotion_deps_install()
    return StreamingResponse(setup_progress_store.sse_stream(task_id), media_type="text/event-stream")
