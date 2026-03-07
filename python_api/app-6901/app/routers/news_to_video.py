from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.news_to_video import (
    TEMPLATES,
    UploadedFileData,
    get_render_result,
    get_remotion_setup_status,
    render_progress_store,
    stage_preview,
    start_render_pipeline,
    upload_user_asset,
)


router = APIRouter(prefix="/api/v1/news-to-video", tags=["news-to-video"])


def _to_file(upload: UploadFile | None, field_name: str) -> UploadedFileData:
    if upload is None or not upload.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"{field_name} is empty")
    return UploadedFileData(filename=upload.filename, content_type=upload.content_type, data=data)


@router.get("/templates")
def list_templates() -> dict:
    return {
        "templates": [
            {
                "id": key,
                "composition": cfg["_composition"],
                "config_filename": cfg["_config_filename"],
                "uses_hero": cfg.get("_uses_hero", False),
            }
            for key, cfg in TEMPLATES.items()
        ]
    }


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
    if template not in TEMPLATES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{template}'. Valid templates: {list(TEMPLATES.keys())}",
        )
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
        task_id = start_render_pipeline(
            job_store=job_store,
            template_key=template,
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
    if template not in TEMPLATES:
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
        result = stage_preview(
            template_key=template,
            audio=audio,
            transcript=transcript,
            images=image_list,
            hero_image=hero,
            overrides=overrides,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.post("/upload-asset")
def upload_asset_endpoint(file: UploadFile = File(...)) -> dict:
    upload = _to_file(file, "file")
    try:
        path = upload_user_asset(upload)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": path}


@router.get("/setup/status")
def remotion_setup_status() -> dict:
    return get_remotion_setup_status()
