from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from ..services.text_normalizer.text_processor import (
    _load_csv_map,
    clean_text_for_tts,
    process_text_for_tts,
)

router = APIRouter(prefix="/api/v1/text", tags=["text-normalizer"])

_DATA_DIR = Path(__file__).resolve().parent.parent / "services" / "text_normalizer" / "data"
_acronym_map = _load_csv_map(str(_DATA_DIR / "acronyms.csv"))
_replacement_map = _load_csv_map(str(_DATA_DIR / "non-vietnamese-words.csv"))


@router.post("/normalize")
def normalize_text(payload: dict = Body(...)) -> dict:
    text = str(payload.get("text") or "").strip()
    language = str(payload.get("language") or "vi").strip().lower()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    if language == "vi":
        normalized = process_text_for_tts(
            text,
            acronym_map=_acronym_map,
            replacement_map=_replacement_map,
        )
    else:
        normalized = clean_text_for_tts(text, lang=language)

    return {"normalized_text": normalized}
