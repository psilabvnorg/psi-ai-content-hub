from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import List
from urllib.request import urlopen

from python_api.common.logging import log
from python_api.common.paths import MODEL_F5_DIR, TEMP_DIR
from python_api.common.progress import ProgressStore
from python_api.common.jobs import JobStore


SERVICE_ROOT = Path(__file__).resolve().parents[2]
ASSETS_ROOT = Path(os.environ.get("VOICE_CLONE_ASSETS", str(SERVICE_ROOT))).resolve()
VOICES_JSON = Path(os.environ.get("VOICE_CLONE_VOICES_JSON", str(ASSETS_ROOT / "original_voice_ref" / "voices.json"))).resolve()

SAMPLES_DIR = ASSETS_ROOT / "static" / "samples"
VOICE_REF_DIR = ASSETS_ROOT / "original_voice_ref"

MODEL_FILE = MODEL_F5_DIR / "model_last.pt"
VOCAB_FILE = MODEL_F5_DIR / "vocab.txt"
MODEL_MARKER = MODEL_F5_DIR / "model_ready.json"

HF_MODEL_URL = "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/model_last.pt"
HF_VOCAB_URL = "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/config.json"

progress_store = ProgressStore()
task_files: dict[str, str] = {}


def _ensure_dirs() -> None:
    MODEL_F5_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _model_ready() -> bool:
    return MODEL_FILE.exists() and VOCAB_FILE.exists()


def model_status() -> dict:
    return {
        "installed": _model_ready(),
        "model_file": str(MODEL_FILE) if MODEL_FILE.exists() else None,
        "vocab_file": str(VOCAB_FILE) if VOCAB_FILE.exists() else None,
    }


def _load_voices() -> List[dict]:
    if not VOICES_JSON.exists():
        return []
    with VOICES_JSON.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("voices", [])


def _get_voice(voice_id: str) -> dict | None:
    for voice in _load_voices():
        if voice.get("id") == voice_id:
            return voice
    return None


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


def download_model(job_store: JobStore) -> str:
    task_id = f"voice_model_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "starting", 0, "Starting model download...")

    def runner() -> None:
        try:
            _ensure_dirs()
            _download_file(HF_MODEL_URL, MODEL_FILE, task_id, 5, 70)
            _download_file(HF_VOCAB_URL, VOCAB_FILE, task_id, 70, 95)
            MODEL_MARKER.write_text(json.dumps({"ready": True, "time": time.time()}))
            progress_store.set_progress(task_id, "complete", 100, "Model ready")
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
) -> str:
    task_id = f"voice_tts_{uuid.uuid4().hex}"
    progress_store.set_progress(task_id, "starting", 0, "Starting generation...")

    def runner() -> None:
        try:
            if not _model_ready():
                progress_store.set_progress(task_id, "error", 0, "Model not downloaded")
                return

            voice = _get_voice(voice_id)
            if not voice:
                progress_store.set_progress(task_id, "error", 0, "Voice not found")
                return

            ref_audio = VOICE_REF_DIR / voice["ref_audio"]
            ref_text = voice.get("ref_text", "")
            if not ref_audio.exists():
                progress_store.set_progress(task_id, "error", 0, "Reference audio not found")
                return

            output_name = f"voice_clone_{int(time.time())}.wav"
            output_path = TEMP_DIR / output_name

            # Use f5-tts_infer-cli command directly (same as working infer.py)
            cmd = [
                "f5-tts_infer-cli",
                "--model", "F5TTS_Base",
                "--ref_audio", str(ref_audio),
                "--ref_text", ref_text,
                "--gen_text", text,
                "--speed", str(speed),
                "--vocoder_name", "vocos",
                "--vocab_file", str(VOCAB_FILE),
                "--ckpt_file", str(MODEL_FILE),
                "--output_dir", str(TEMP_DIR),
                "--output_file", output_name,
            ]
            if remove_silence:
                cmd.append("--remove_silence")

            progress_store.set_progress(task_id, "generating", 30, "Generating audio...")
            
            # Set UTF-8 encoding environment variables
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONLEGACYWINDOWSSTDIO"] = "utf-8"
            
            # Run with subprocess.run like the working infer.py
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env
            )
            
            # Log output
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


def list_voices() -> dict:
    return {"voices": _load_voices()}


def get_download_file_id(task_id: str) -> str | None:
    return task_files.get(task_id)
