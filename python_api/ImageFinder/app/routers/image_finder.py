from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..services.image_finder import ImageFinderError, find_images


router = APIRouter(prefix="/api/v1/image-finder", tags=["image-finder"])


def _parse_int(value: object, field_name: str, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")


@router.post("/search")
def image_finder_search(payload: dict = Body(...)) -> dict:
    text = str(payload.get("text") or "").strip()
    number_of_images = _parse_int(payload.get("number_of_images"), "number_of_images", 5)
    target_words = _parse_int(payload.get("target_words"), "target_words", 15)
    model = str(payload.get("model") or "deepseek-r1:8b").strip()
    lang = str(payload.get("lang") or "en").strip()
    timeout_seconds = _parse_int(payload.get("timeout_seconds"), "timeout_seconds", 60)

    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if number_of_images < 1:
        raise HTTPException(status_code=400, detail="number_of_images must be >= 1")

    try:
        result = find_images(
            text=text,
            number_of_images=number_of_images,
            target_words=target_words,
            model=model,
            lang=lang,
            timeout_seconds=timeout_seconds,
        )
        return {"status": "ok", **result}
    except ImageFinderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

