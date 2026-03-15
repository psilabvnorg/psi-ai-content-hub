from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services.news_to_video import (
    REMOTION_ROOT,
    RENDER_PROFILES,
    TEMPLATES,
    UploadedFileData,
    get_render_result,
    get_remotion_setup_status,
    get_studio_status,
    load_file_from_path,
    load_images_from_folder,
    render_progress_store,
    stage_preview,
    stage_preview_from_paths,
    start_render_pipeline,
    start_studio,
    stop_studio,
    upload_user_asset,
)


router = APIRouter(prefix="/api/v1/news-to-video", tags=["news-to-video"])


class RenderFromConfigRequest(BaseModel):
    """JSON-only render request — all files are referenced by server-side paths.

    This is intended for automation / scripting workflows where the audio,
    transcript and images are already present on the server running this API.

    Example::

        {
            "template": "NewsVerticalBackground",
            "render_profile": "tiktok",
            "audio_path": "D:/path/to/narration.wav",
            "transcript_path": "D:/path/to/narration.json",
            "slider_image_paths": "D:/path/to/images/",
            "hero_image_path": null,
            "config": {
                "introDurationInFrames": 150,
                "imageDurationInFrames": 170,
                "backgroundMusicVolume": 0.2,
                "backgroundMusic": "background-music/news1.mp3"
            }
        }

    ``slider_image_paths`` is a folder path — all supported images inside
    (jpg/png/webp/etc.) are loaded in sorted filename order, up to 10.

    The response is identical to ``POST /render``: ``{"task_id": "..."}``
    which can then be polled via ``GET /render/stream/{task_id}`` and
    ``GET /render/result/{task_id}``.
    """

    template: str
    render_profile: str = "tiktok"
    audio_path: str
    transcript_path: str
    slider_image_paths: str
    hero_image_path: str | None = None
    config: dict = {}


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
    render_profile: str = Form(default="tiktok"),
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
    if render_profile not in RENDER_PROFILES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown render_profile '{render_profile}'. Valid profiles: {list(RENDER_PROFILES.keys())}",
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
            render_profile=render_profile,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"task_id": task_id}


@router.post("/render-from-config")
def render_from_config_endpoint(
    req: RenderFromConfigRequest,
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    """Start a render from a pure JSON config — no file uploads needed.

    Useful for automation and scripting: pass file paths on the server filesystem
    together with all config options in one JSON body.
    """
    if req.template not in TEMPLATES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{req.template}'. Valid templates: {list(TEMPLATES.keys())}",
        )
    if req.render_profile not in RENDER_PROFILES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown render_profile '{req.render_profile}'. Valid profiles: {list(RENDER_PROFILES.keys())}",
        )
    try:
        audio = load_file_from_path(req.audio_path, "audio_path")
        transcript = load_file_from_path(req.transcript_path, "transcript_path")
        image_list = load_images_from_folder(req.slider_image_paths)
        hero = load_file_from_path(req.hero_image_path, "hero_image_path") if req.hero_image_path else None
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        task_id = start_render_pipeline(
            job_store=job_store,
            template_key=req.template,
            audio=audio,
            transcript=transcript,
            images=image_list,
            hero_image=hero,
            overrides=req.config,
            render_profile=req.render_profile,
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


class StageFromConfigRequest(BaseModel):
    """JSON-only preview-stage request — mirrors RenderFromConfigRequest."""

    template: str
    audio_path: str
    transcript_path: str
    slider_image_paths: str
    hero_image_path: str | None = None
    config: dict = {}


@router.post("/preview/stage-from-config")
def stage_from_config_endpoint(req: StageFromConfigRequest) -> dict:
    """Stage a preview from a pure JSON config (no file uploads needed)."""
    if req.template not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template '{req.template}'")
    try:
        result = stage_preview_from_paths(
            template_key=req.template,
            audio_path=req.audio_path,
            transcript_path=req.transcript_path,
            slider_image_paths=req.slider_image_paths,
            hero_image_path=req.hero_image_path,
            overrides=req.config,
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


@router.get("/background-music/{filename}")
def serve_background_music(filename: str) -> FileResponse:
    """Serve a background music file from remotion/public/background-music/ for preview."""
    # Only allow simple filenames (no path traversal)
    safe_name = Path(filename).name
    music_path = REMOTION_ROOT / "public" / "background-music" / safe_name
    if not music_path.exists() or not music_path.is_file():
        raise HTTPException(status_code=404, detail=f"Music file '{safe_name}' not found")
    return FileResponse(str(music_path), media_type="audio/mpeg")


@router.get("/setup/status")
def remotion_setup_status() -> dict:
    return get_remotion_setup_status()


@router.get("/preview/studio/status")
def studio_status() -> dict:
    return get_studio_status()


@router.post("/preview/studio/start")
def studio_start() -> dict:
    try:
        return start_studio()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/preview/studio/stop")
def studio_stop() -> dict:
    return stop_studio()
