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


def _fmt_time_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _fmt_time_vtt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _segments_to_srt(segments: list) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = seg.get("start") or 0
        end = seg.get("end") or 0
        text = (seg.get("text") or "").strip()
        lines += [str(i), f"{_fmt_time_srt(start)} --> {_fmt_time_srt(end)}", text, ""]
    return "\n".join(lines)


def _segments_to_vtt(segments: list) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        start = seg.get("start") or 0
        end = seg.get("end") or 0
        text = (seg.get("text") or "").strip()
        lines += [f"{_fmt_time_vtt(start)} --> {_fmt_time_vtt(end)}", text, ""]
    return "\n".join(lines)


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


def transcribe(job_store: JobStore, file_path: Path, model: str, language: Optional[str], add_punctuation: bool, word_timestamps: bool = False, script_text: Optional[str] = None) -> str:
    task_id = f"stt_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "queued", 0, "Queued")

    def runner() -> None:
        try:
            _ensure_dirs()
            progress_store.set_progress(task_id, "starting", 5, "Loading model...")
            import torch

            fp16 = torch.cuda.is_available()
            used_stable_ts = False

            if word_timestamps:
                import stable_whisper
                progress_store.set_progress(task_id, "loading", 20, "Loading model (stable-ts)...")
                model_obj = stable_whisper.load_model(model, download_root=str(MODEL_WHISPER_DIR))
                if script_text:
                    progress_store.set_progress(task_id, "transcribing", 40, "Aligning original text to audio (forced alignment)...")
                    raw = model_obj.align(str(file_path), script_text, language=language)
                else:
                    progress_store.set_progress(task_id, "transcribing", 40, "Transcribing with stable-ts (improved alignment)...")
                    raw = model_obj.transcribe(str(file_path), language=language, verbose=False, fp16=fp16)
                result = raw.to_dict() if hasattr(raw, "to_dict") else dict(raw)
                used_stable_ts = True
            else:
                import whisper
                progress_store.set_progress(task_id, "loading", 20, "Loading model...")
                model_obj = whisper.load_model(model, download_root=str(MODEL_WHISPER_DIR))
                progress_store.set_progress(task_id, "transcribing", 40, "Transcribing...")
                result = model_obj.transcribe(str(file_path), language=language, verbose=False, fp16=fp16, word_timestamps=False)

            progress_store.set_progress(task_id, "finalizing", 90, "Finalizing...")
            text_with_punct = (result.get("text") or "").strip()
            text_no_punct = _strip_punctuation(text_with_punct)
            final_text = text_with_punct if add_punctuation else text_no_punct
            segments = result.get("segments", []) or []
            # Normalize segment dicts (stable_whisper may return objects)
            segments = [
                s if isinstance(s, dict) else {"start": getattr(s, "start", None), "end": getattr(s, "end", None), "text": getattr(s, "text", "")}
                for s in segments
            ]
            duration = segments[-1].get("end") if segments else None
            srt_content = _segments_to_srt(segments) if word_timestamps and segments else None
            vtt_content = _segments_to_vtt(segments) if word_timestamps and segments else None
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
                "srt": srt_content,
                "vtt": vtt_content,
                "used_stable_ts": used_stable_ts,
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
