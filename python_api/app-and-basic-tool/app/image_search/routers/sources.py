from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..services.image_pipeline.orchestrator import run_pipeline
from ..services.image_pipeline.search import ALL_SOURCE_IDS


router = APIRouter(prefix="/api/v1/sources", tags=["sources"])

VALID_SOURCES = set(ALL_SOURCE_IDS)
SOURCE_CATALOG: list[dict[str, str | bool]] = [
    {"id": "google", "name": "Google Images", "category": "general", "requires_key": False},
    {"id": "bing", "name": "Bing Images", "category": "general", "requires_key": False},
    {"id": "unsplash", "name": "Unsplash", "category": "api_key", "requires_key": True},
    {"id": "civitai", "name": "Civitai", "category": "ai", "requires_key": False},
    {"id": "kling_ai", "name": "KlingAI", "category": "ai", "requires_key": False},
    {"id": "artvee", "name": "Artvee", "category": "art", "requires_key": False},
    {"id": "wga", "name": "Web Gallery of Art", "category": "art", "requires_key": False},
]


def _parse_int(value: object, field_name: str, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")


@router.get("")
def list_sources() -> dict[str, list[dict[str, str | bool]]]:
    return {"sources": SOURCE_CATALOG}


@router.post("/{source_id}/search")
def search_single_source(source_id: str, payload: dict = Body(...)) -> dict:
    if source_id not in VALID_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source_id}")

    query = str(payload.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    max_results = max(1, min(20, _parse_int(payload.get("max_results"), "max_results", 10)))
    timeout_seconds = max(5, min(120, _parse_int(payload.get("timeout_seconds"), "timeout_seconds", 30)))

    try:
        result = run_pipeline(
            paragraph=query,
            query_generator=lambda _: query,
            per_source_limit=max_results,
            top_k=max_results,
            timeout_seconds=timeout_seconds,
            enabled_sources=[source_id],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    images = result.get("images")
    normalized_images = images if isinstance(images, list) else []
    return {
        "status": "ok",
        "source": source_id,
        "query": query,
        "count": len(normalized_images),
        "images": normalized_images,
        "summary": result.get("summary"),
    }
