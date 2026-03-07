from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.remotion_platform import (
    UploadedFileData,
    get_render_result,
    get_remotion_setup_status,
    get_template_preset,
    render_progress_store,
    stage_news_preview,
    start_news_render,
)


router = APIRouter(prefix="/api/v1/news-to-video", tags=["news-to-video"])


def _to_file(upload: UploadFile | None, field_name: str) -> UploadedFileData:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
    return UploadedFileData(filename=upload.filename, content_type=upload.content_type, data=data)


@router.post("/render")
def create_render_task(
    template: str = Form(...),
    config_overrides: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    transcript_file: UploadFile | None = File(default=None),
    images: list[UploadFile] = File(default=[]),
    hero_image: UploadFile | None = File(default=None),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    if not get_template_preset(template):
        raise HTTPException(status_code=400, detail=f"Unknown template '{template}'")
    if not images or len(images) < 1 or len(images) > 10:
        raise HTTPException(status_code=400, detail="images must contain between 1 and 10 files")

    audio = _to_file(audio_file, "audio_file")
    transcript = _to_file(transcript_file, "transcript_file")
    image_list = [_to_file(img, f"images[{i}]") for i, img in enumerate(images)]
    hero = _to_file(hero_image, "hero_image") if hero_image and hero_image.filename else None

    try:
        overrides: dict = json.loads(config_overrides) if config_overrides else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid config_overrides JSON: {exc}") from exc

    try:
        task_id = start_news_render(
            job_store=job_store,
            preset_identifier=template,
            audio=audio,
            transcript=transcript,
            images=image_list,
            hero_image=hero,
            overrides=overrides,
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
def stage_preview_endpoint(
    template: str = Form(...),
    config_overrides: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    transcript_file: UploadFile | None = File(default=None),
    images: list[UploadFile] = File(default=[]),
    hero_image: UploadFile | None = File(default=None),
) -> dict:
    if not get_template_preset(template):
        raise HTTPException(status_code=400, detail=f"Unknown template '{template}'")
    if not images or len(images) < 1 or len(images) > 10:
        raise HTTPException(status_code=400, detail="images must contain between 1 and 10 files")

    audio = _to_file(audio_file, "audio_file")
    transcript = _to_file(transcript_file, "transcript_file")
    image_list = [_to_file(img, f"images[{i}]") for i, img in enumerate(images)]
    hero = _to_file(hero_image, "hero_image") if hero_image and hero_image.filename else None

    try:
        overrides: dict = json.loads(config_overrides) if config_overrides else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid config_overrides JSON: {exc}") from exc

    try:
        result = stage_news_preview(
            preset_identifier=template,
            audio=audio,
            transcript=transcript,
            images=image_list,
            hero_image=hero,
            overrides=overrides,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.get("/setup/status")
def remotion_setup_status() -> dict:
    return get_remotion_setup_status()
