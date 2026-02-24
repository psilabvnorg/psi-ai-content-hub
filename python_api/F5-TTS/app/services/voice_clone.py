from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import unicodedata
import uuid
from pathlib import Path
from typing import List
from urllib.request import urlopen

from python_api.common.logging import log
from python_api.common.paths import MODEL_F5_VN_DIR, MODEL_F5_EN_DIR, TEMP_DIR
from python_api.common.progress import ProgressStore
from python_api.common.jobs import JobStore


SERVICE_ROOT = Path(__file__).resolve().parents[2]
ASSETS_ROOT = Path(os.environ.get("VOICE_CLONE_ASSETS", str(SERVICE_ROOT))).resolve()

SAMPLES_DIR = ASSETS_ROOT / "static" / "samples"

# Per-language voice reference directories and config files
VOICE_REF_DIR_VI = ASSETS_ROOT / "original_voice_ref"
VOICE_REF_DIR_EN = ASSETS_ROOT / "original_voice_ref_en"
VOICES_JSON_VI = VOICE_REF_DIR_VI / "voices.json"
VOICES_JSON_EN = VOICE_REF_DIR_EN / "voices.json"

# Per-language model paths
MODEL_FILE_VN = MODEL_F5_VN_DIR / "model_last.pt"
VOCAB_FILE_VN = MODEL_F5_VN_DIR / "vocab.txt"
MODEL_FILE_EN = MODEL_F5_EN_DIR / "model_last.pt"
VOCAB_FILE_EN = MODEL_F5_EN_DIR / "vocab.txt"

# Backward-compat aliases (VN was the original single model)
MODEL_FILE = MODEL_FILE_VN
VOCAB_FILE = VOCAB_FILE_VN

MODEL_DOWNLOAD_SOURCES: dict[str, dict[str, str]] = {
    "vi": {
        "model_url": "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/model_last.pt",
        "vocab_url": "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/config.json",
    },
    "en": {
        "model_url": "https://huggingface.co/SWivid/F5-TTS/resolve/main/F5TTS_Base/model_1200000.safetensors",
        "vocab_url": "https://huggingface.co/SWivid/F5-TTS/resolve/main/F5TTS_Base/vocab.txt",
    },
}

progress_store = ProgressStore()
task_files: dict[str, str] = {}


def _ensure_dirs() -> None:
    MODEL_F5_VN_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_F5_EN_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _get_model_paths(language: str) -> tuple[Path, Path]:
    """Return (model_file, vocab_file) for the given language code."""
    if language == "en":
        return MODEL_FILE_EN, VOCAB_FILE_EN
    return MODEL_FILE_VN, VOCAB_FILE_VN


def _get_voices_config(language: str) -> tuple[Path, Path]:
    """Return (voices_json, voice_ref_dir) for the given language code."""
    if language == "en":
        return VOICES_JSON_EN, VOICE_REF_DIR_EN
    return VOICES_JSON_VI, VOICE_REF_DIR_VI


def _model_ready(language: str = "vi") -> bool:
    model_file, vocab_file = _get_model_paths(language)
    return model_file.exists() and vocab_file.exists()


def model_status(language: str = "vi") -> dict:
    model_file, vocab_file = _get_model_paths(language)
    return {
        "installed": model_file.exists() and vocab_file.exists(),
        "model_dir": str(model_file.parent),
        "model_file": str(model_file) if model_file.exists() else None,
        "vocab_file": str(vocab_file) if vocab_file.exists() else None,
    }


def model_status_all() -> dict:
    return {
        "vi": model_status("vi"),
        "en": model_status("en"),
    }


def _load_voices(language: str = "vi") -> List[dict]:
    voices_json, _ = _get_voices_config(language)
    if not voices_json.exists():
        return []
    with voices_json.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("voices", [])


def _get_voice(voice_id: str, language: str = "vi") -> dict | None:
    for voice in _load_voices(language):
        if voice.get("id") == voice_id:
            return voice
    return None


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")
    return slug


def _ensure_unique_voice_id(base_id: str, existing_ids: set[str]) -> str:
    if base_id not in existing_ids:
        return base_id
    index = 2
    while f"{base_id}_{index}" in existing_ids:
        index += 1
    return f"{base_id}_{index}"


def _download_file(url: str, target: Path, task_id: str, start_percent: int, end_percent: int) -> None:
    progress_store.add_log(task_id, f"Downloading {url}")
    with urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        downloaded = 0
        chunk_size = 1024 * 1024
        with target.open("wb") as handle:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    percent = start_percent + int((downloaded / total) * (end_percent - start_percent))
                else:
                    percent = start_percent
                progress_store.set_progress(task_id, "downloading", min(end_percent, percent), "Downloading model files...")


def _normalize_language(language: str) -> str:
    normalized = (language or "vi").strip().lower()
    if normalized not in MODEL_DOWNLOAD_SOURCES:
        raise ValueError(f"Unsupported language: {language}")
    return normalized


def register_voice(
    name: str,
    language: str,
    transcript: str,
    sample_bytes: bytes,
    sample_filename: str,
    description: str | None = None,
) -> dict:
    selected_language = _normalize_language(language)
    clean_name = (name or "").strip()
    clean_transcript = (transcript or "").strip()
    if not clean_name:
        raise ValueError("name is required")
    if not clean_transcript:
        raise ValueError("transcript is required")
    if not sample_bytes:
        raise ValueError("sample audio is required")

    _ensure_dirs()
    voices_json, voice_ref_dir = _get_voices_config(selected_language)
    voice_ref_dir.mkdir(parents=True, exist_ok=True)

    payload: dict = {"voices": []}
    if voices_json.exists():
        with voices_json.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    existing_voices = payload.get("voices", [])
    if not isinstance(existing_voices, list):
        existing_voices = []

    existing_ids = {str(voice.get("id", "")).strip() for voice in existing_voices if voice.get("id")}
    base_voice_id = _slugify(clean_name) or f"voice_{uuid.uuid4().hex[:8]}"
    voice_id = _ensure_unique_voice_id(base_voice_id, existing_ids)

    ext = Path(sample_filename or "").suffix.lower()
    if ext not in {".wav", ".mp3"}:
        ext = ".wav"

    voice_dir = voice_ref_dir / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)
    audio_filename = f"{voice_id}_sample{ext}"
    audio_path = voice_dir / audio_filename
    audio_path.write_bytes(sample_bytes)

    default_description = "Custom English voice" if selected_language == "en" else "Giọng tùy chỉnh tiếng Việt"
    voice_entry = {
        "id": voice_id,
        "name": clean_name,
        "description": (description or "").strip() or default_description,
        "language": selected_language,
        "gender": "unknown",
        "custom": True,
        "ref_audio": f"{voice_id}/{audio_filename}",
        "ref_text": clean_transcript,
    }

    existing_voices.append(voice_entry)
    payload["voices"] = existing_voices
    voices_json.parent.mkdir(parents=True, exist_ok=True)
    with voices_json.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    return voice_entry


def download_model(job_store: JobStore, language: str = "vi") -> str:
    selected_language = _normalize_language(language)
    model_label = "English" if selected_language == "en" else "Vietnamese"
    sources = MODEL_DOWNLOAD_SOURCES[selected_language]
    model_file, vocab_file = _get_model_paths(selected_language)

    task_id = f"voice_model_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "starting", 0, f"Starting {model_label} model download...")

    def runner() -> None:
        try:
            _ensure_dirs()
            _download_file(sources["model_url"], model_file, task_id, 5, 70)
            _download_file(sources["vocab_url"], vocab_file, task_id, 70, 95)
            model_marker = model_file.parent / "model_ready.json"
            model_marker.write_text(json.dumps({"ready": True, "time": time.time()}))
            progress_store.set_progress(task_id, "complete", 100, f"{model_label} model ready")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Voice clone model download failed: {exc}", "error", log_name="f5-tts.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def generate(
    job_store: JobStore,
    voice_id: str,
    text: str,
    speed: float,
    cfg_strength: float,
    nfe_step: int,
    remove_silence: bool,
    language: str = "vi",
) -> str:
    task_id = f"voice_tts_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "starting", 0, "Starting generation...")

    def runner() -> None:
        try:
            if not _model_ready(language):
                progress_store.set_progress(task_id, "error", 0, f"Model not downloaded for language: {language}")
                return

            voice = _get_voice(voice_id, language)
            if not voice:
                progress_store.set_progress(task_id, "error", 0, "Voice not found")
                return

            _, voice_ref_dir = _get_voices_config(language)
            model_file, vocab_file = _get_model_paths(language)

            ref_audio = voice_ref_dir / voice["ref_audio"]
            ref_text = voice.get("ref_text", "")
            if not ref_audio.exists():
                progress_store.set_progress(task_id, "error", 0, "Reference audio not found")
                return

            output_name = f"voice_clone_{int(time.time())}.wav"
            output_path = TEMP_DIR / output_name

            # Use full path to f5-tts_infer-cli from the venv Scripts/bin dir
            # (when launched from Electron, venv isn't activated so bare name won't resolve)
            venv_scripts_dir = Path(sys.executable).parent
            cli_name = "f5-tts_infer-cli.exe" if sys.platform == "win32" else "f5-tts_infer-cli"
            cli_path = str(venv_scripts_dir / cli_name)
            cmd = [
                cli_path,
                "--model", "F5TTS_Base",
                "--ref_audio", str(ref_audio),
                "--ref_text", ref_text,
                "--gen_text", text,
                "--speed", str(speed),
                "--vocoder_name", "vocos",
                "--vocab_file", str(vocab_file),
                "--ckpt_file", str(model_file),
                "--output_dir", str(TEMP_DIR),
                "--output_file", output_name,
            ]
            if remove_silence:
                cmd.append("--remove_silence")

            progress_store.set_progress(task_id, "generating", 30, "Generating audio...")

            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONLEGACYWINDOWSSTDIO"] = "utf-8"

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env
            )

            if result.stdout:
                for line in result.stdout.split('\n'):
                    if line.strip():
                        progress_store.add_log(task_id, line.strip())

            code = result.returncode
            if code != 0:
                progress_store.set_progress(task_id, "error", 0, "TTS process failed")
                return

            if not output_path.exists():
                progress_store.set_progress(task_id, "error", 0, "Output file missing")
                return

            file_record = job_store.add_file(output_path, output_name)
            task_files[task_id] = file_record.file_id
            progress_store.set_progress(task_id, "complete", 100, "Complete")
            progress_store.add_log(task_id, json.dumps({"download_url": f"/api/v1/files/{file_record.file_id}"}))
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Voice clone generation failed: {exc}", "error", log_name="f5-tts.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def list_samples() -> dict:
    if not SAMPLES_DIR.exists():
        return {"samples": []}
    items = []
    for sample in sorted(SAMPLES_DIR.glob("*.wav")):
        items.append({"id": sample.name, "filename": sample.name})
    return {"samples": items}


def list_voices(language: str = "vi", custom_only: bool = False) -> dict:
    voices = _load_voices(language)
    if custom_only:
        voices = [voice for voice in voices if bool(voice.get("custom"))]
    return {"voices": voices}


def get_download_file_id(task_id: str) -> str | None:
    return task_files.get(task_id)
