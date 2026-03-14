from __future__ import annotations

import threading
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from python_api.common.jobs import JobStore
from python_api.common.progress import ProgressStore
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

_download_progress = ProgressStore()

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


# ── helpers ──────────────────────────────────────────────────────────────────

def _download_models_worker(task_id: str) -> None:
    try:
        _download_progress.set_progress(task_id, "starting", 0, "Starting download from HuggingFace...")
        from huggingface_hub import snapshot_download  # type: ignore
        svc._FINETUNE_DIR.mkdir(parents=True, exist_ok=True)
        _download_progress.set_progress(task_id, "downloading", 10, "Downloading eSpeak NG...")
        snapshot_download(
            repo_id="psilab/piper-tts-finetune",
            local_dir=str(svc._FINETUNE_DIR),
            allow_patterns=["eSpeak NG/**"],
        )
        _download_progress.set_progress(task_id, "downloading", 60, "Downloading TTS models...")
        snapshot_download(
            repo_id="psilab/piper-tts-finetune",
            local_dir=str(svc._FINETUNE_DIR),
            allow_patterns=["tts-model/**"],
        )
        _download_progress.set_progress(task_id, "complete", 100, "Models downloaded successfully.")
    except Exception as exc:
        _download_progress.set_progress(task_id, "error", 0, str(exc))


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/model-status")
def get_model_status() -> dict:
    espeak_ok = svc._ESPEAK_DIR.exists()
    model_ok = svc._MODEL_DIR.exists()
    return {
        "installed": espeak_ok and model_ok,
        "espeak_ng": {"exists": espeak_ok, "path": str(svc._ESPEAK_DIR)},
        "tts_model": {"exists": model_ok, "path": str(svc._MODEL_DIR)},
        "model_dir": str(svc._FINETUNE_DIR),
    }


@router.post("/download-models")
def download_models() -> StreamingResponse:
    task_id = uuid4().hex
    threading.Thread(target=_download_models_worker, args=(task_id,), daemon=True).start()
    return StreamingResponse(_download_progress.sse_stream(task_id), media_type="text/event-stream")


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
