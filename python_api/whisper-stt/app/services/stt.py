from __future__ import annotations

import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from python_api.common.logging import log
from python_api.common.paths import MODEL_WHISPER_DIR, TEMP_DIR
from python_api.common.progress import ProgressStore
from python_api.common.jobs import JobStore


progress_store = ProgressStore()
result_store: dict[str, dict] = {}


def _ensure_dirs() -> None:
    MODEL_WHISPER_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _check_dependencies() -> dict:
    missing = []
    available = []
    for pkg in ["whisper", "fastapi", "uvicorn", "numpy", "torch"]:
        try:
            __import__(pkg)
            available.append(pkg)
        except Exception:
            missing.append(pkg)
    return {"available": available, "missing": missing, "ffmpeg_ok": shutil.which("ffmpeg") is not None}


def _strip_punctuation(text: str) -> str:
    if not text:
        return text
    text = re.sub(r"[^\w\s\u00C0-\u1EF9]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def status() -> dict:
    deps = _check_dependencies()
    cached = [p.name for p in MODEL_WHISPER_DIR.glob("*.pt")] if MODEL_WHISPER_DIR.exists() else []
    return {
        "deps_ok": len(deps["missing"]) == 0,
        "deps_missing": deps["missing"],
        "ffmpeg_ok": deps["ffmpeg_ok"],
        "model_dir": str(MODEL_WHISPER_DIR),
        "cached_models": cached,
        "server_time": time.time(),
    }


def save_upload(filename: str, content: bytes) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix or ".wav"
    target = TEMP_DIR / f"stt_{uuid.uuid4().hex}{suffix}"
    target.write_bytes(content)
    return target


def download_model(job_store: JobStore, model_name: str) -> str:
    task_id = f"stt_model_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "starting", 0, f"Downloading model {model_name}")

    def runner() -> None:
        try:
            _ensure_dirs()
            import whisper

            progress_store.set_progress(task_id, "downloading", 20, "Downloading model...")
            model = whisper.load_model(model_name, download_root=str(MODEL_WHISPER_DIR))
            del model
            progress_store.set_progress(task_id, "complete", 100, "Model download complete")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"STT model download failed: {exc}", "error", log_name="whisper-stt.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def transcribe(job_store: JobStore, file_path: Path, model: str, language: Optional[str], add_punctuation: bool, word_timestamps: bool = False) -> str:
    task_id = f"stt_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "queued", 0, "Queued")

    def runner() -> None:
        try:
            _ensure_dirs()
            progress_store.set_progress(task_id, "starting", 5, "Loading model...")
            import whisper
            import torch

            model_obj = whisper.load_model(model, download_root=str(MODEL_WHISPER_DIR))
            progress_store.set_progress(task_id, "transcribing", 40, "Transcribing...")
            fp16 = torch.cuda.is_available()
            result = model_obj.transcribe(str(file_path), language=language, verbose=False, fp16=fp16, word_timestamps=word_timestamps)
            progress_store.set_progress(task_id, "finalizing", 90, "Finalizing...")
            text_with_punct = (result.get("text") or "").strip()
            text_no_punct = _strip_punctuation(text_with_punct)
            final_text = text_with_punct if add_punctuation else text_no_punct
            segments = result.get("segments", []) or []
            duration = segments[-1].get("end") if segments else None
            payload = {
                "status": "complete",
                "percent": 100,
                "message": "Complete",
                "text": final_text,
                "text_with_punctuation": text_with_punct,
                "text_no_punctuation": text_no_punct,
                "punctuation_restored": add_punctuation,
                "language": result.get("language", language),
                "duration": duration,
                "segments_count": len(segments),
                "segments": segments,
                "updated": time.time(),
            }
            result_store[task_id] = payload
            progress_store.set_progress(task_id, "complete", 100, "Complete")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"STT transcribe failed: {exc}", "error", log_name="whisper-stt.log")
        finally:
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_result(task_id: str) -> Optional[dict]:
    return result_store.get(task_id)
