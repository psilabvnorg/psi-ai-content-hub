from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from python_api.common.model_download_service import (
    MODEL_REGISTRY,
    download_progress,
    get_all_model_statuses,
    is_model_downloaded,
    start_download,
)

router = APIRouter(prefix="/api/v1/models", tags=["model-download"])


@router.get("/status")
def models_status() -> dict:
    return {"models": get_all_model_statuses()}


@router.get("/{model_key}/status")
def model_status(model_key: str) -> dict:
    if model_key not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model key '{model_key}'. Valid keys: {list(MODEL_REGISTRY.keys())}",
        )
    entry = MODEL_REGISTRY[model_key]
    return {
        "model_key": model_key,
        "repo_id": entry.repo_id,
        "display_name": entry.display_name,
        "local_dir": str(entry.local_dir),
        "downloaded": is_model_downloaded(model_key),
    }


@router.post("/{model_key}/download")
def download_model_endpoint(model_key: str) -> StreamingResponse:
    if model_key not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model key '{model_key}'. Valid keys: {list(MODEL_REGISTRY.keys())}",
        )
    task_id = start_download(model_key)
    return StreamingResponse(
        download_progress.sse_stream(task_id),
        media_type="text/event-stream",
    )
