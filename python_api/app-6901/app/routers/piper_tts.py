from __future__ import annotations

from pathlib import Path
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services import piper_tts_service as svc
from ..services.text_normalizer.text_processor import (
    _load_csv_map,
    clean_text_for_tts,
    chunk_text,
    chunk_text_i18n,
    process_text_for_tts,
)

router = APIRouter(prefix="/api/v1/piper-tts", tags=["piper-tts"])

_DATA_DIR = Path(__file__).resolve().parent.parent / "services" / "text_normalizer" / "data"
_acronym_map = _load_csv_map(str(_DATA_DIR / "acronyms.csv"))
_replacement_map = _load_csv_map(str(_DATA_DIR / "non-vietnamese-words.csv"))


def _normalize_and_chunk(text: str, language: str) -> List[str]:
    """
    Normalize text then split into sentence chunks.

    Vietnamese  → process_text_for_tts (full pipeline) → chunk_text
    Other langs → clean_text_for_tts                   → chunk_text_i18n

    Each chunk ends with a sentence-boundary punctuation mark so the ONNX
    model receives the '.' phoneme ID before EOS, producing a natural pause
    and falling intonation at the end of every sentence.
    """
    if language == "vi":
        normalized = process_text_for_tts(
            text,
            acronym_map=_acronym_map,
            replacement_map=_replacement_map,
        )
        return chunk_text(normalized)
    else:
        normalized = clean_text_for_tts(text, lang=language)
        return chunk_text_i18n(normalized)


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/voices")
def get_voices(language: str | None = Query(default=None)) -> dict:
    return {"voices": svc.list_voices(language=language)}


@router.get("/demo/{filename}")
def get_demo(filename: str) -> FileResponse:
    path = svc.get_demo_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Demo file not found")
    return FileResponse(str(path), media_type="audio/wav")


@router.post("/generate")
def generate(
    payload: dict = Body(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    text = str(payload.get("text") or "").strip()
    voice_id = str(payload.get("voice_id") or "").strip()
    language = str(payload.get("language") or "vi").strip().lower()
    speed = float(payload.get("speed") or 1.0)
    normalize = bool(payload.get("normalize", True))

    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if not voice_id:
        raise HTTPException(status_code=400, detail="voice_id is required")

    if normalize:
        chunks = _normalize_and_chunk(text, language)
    else:
        # No normalization: treat the raw text as a single chunk,
        # still force a trailing period so the model gets a clean EOS.
        raw = text if text[-1] in ".!?" else text + "."
        chunks = [raw]

    if not chunks:
        raise HTTPException(status_code=400, detail="text is empty after normalization")

    try:
        output_path, filename = svc.generate_from_chunks(
            chunks=chunks, voice_id=voice_id, speed=speed, language=language
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Piper TTS generation failed: {exc}") from exc

    file_record = job_store.add_file(output_path, filename)
    return {
        "status": "success",
        "file_id": file_record.file_id,
        "filename": filename,
        "download_url": f"/api/v1/files/{file_record.file_id}",
        "normalized_text": " ".join(chunks),
        "chunks": chunks,
    }
