#!/usr/bin/env python3
"""
Local REST server for Voice Clone (F5-TTS).
Runs on 127.0.0.1:8188 and exposes REST + SSE endpoints.
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse


APP = FastAPI(title="Voice Clone Server", version="1.0.0")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------
# Paths and constants
# ---------------------------
APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
LOG_DIR = Path(APPDATA) / "psi-ai-content-hub" / "logs"
LOG_FILE = LOG_DIR / "voice-clone.log"
LOG_MAX_BYTES = 5 * 1024 * 1024

MODEL_DIR = Path(APPDATA) / "psi-ai-content-hub" / "models" / "f5-tts"
MODEL_FILE = MODEL_DIR / "model_last.pt"
VOCAB_FILE = MODEL_DIR / "vocab.txt"
MODEL_MARKER = MODEL_DIR / "model_ready.json"

TEMP_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

ASSETS_ROOT = Path(os.environ.get("VOICE_CLONE_ASSETS", "")).resolve() if os.environ.get("VOICE_CLONE_ASSETS") else None
VOICES_JSON = Path(os.environ.get("VOICE_CLONE_VOICES_JSON", "")).resolve() if os.environ.get("VOICE_CLONE_VOICES_JSON") else None

if ASSETS_ROOT is None:
    ASSETS_ROOT = Path(__file__).resolve().parent.parent / "F5-TTS-Vietnamese"
if VOICES_JSON is None:
    VOICES_JSON = Path(__file__).resolve().parent.parent / "shared" / "voice-clone" / "voices.json"

SAMPLES_DIR = ASSETS_ROOT / "fast_api" / "static" / "samples"
VOICE_REF_DIR = ASSETS_ROOT / "original_voice_ref"

HF_MODEL_URL = "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/model_last.pt"
HF_VOCAB_URL = "https://huggingface.co/hynt/F5-TTS-Vietnamese-ViVoice/resolve/main/config.json"


# ---------------------------
# Logging
# ---------------------------
def _rotate_logs():
    try:
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > LOG_MAX_BYTES:
            backup = LOG_FILE.with_suffix(".log.1")
            try:
                if backup.exists():
                    backup.unlink()
            except Exception:
                pass
            LOG_FILE.rename(backup)
    except Exception:
        pass


def log(message: str, level: str = "info") -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    _rotate_logs()
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{level.upper()}] {message}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ---------------------------
# Progress store
# ---------------------------
progress_store: Dict[str, Dict] = {}
progress_logs: Dict[str, List[str]] = {}


def set_progress(task_id: str, status: str, percent: int, message: str = ""):
    progress_store[task_id] = {
        "status": status,
        "percent": percent,
        "message": message,
        "updated": time.time(),
    }


def add_task_log(task_id: str, line: str):
    progress_logs.setdefault(task_id, [])
    progress_logs[task_id].append(line)
    if len(progress_logs[task_id]) > 200:
        progress_logs[task_id] = progress_logs[task_id][-200:]


def sse_stream(task_id: str):
    last_sent = 0.0
    while True:
        data = progress_store.get(task_id)
        logs = progress_logs.get(task_id, [])
        if data:
            payload = dict(data)
            payload["logs"] = logs[-50:]
            yield f"data: {json.dumps(payload)}\n\n"
            last_sent = data.get("updated", last_sent)
            if data.get("status") in ("complete", "error"):
                break
        else:
            yield f"data: {json.dumps({'status': 'waiting', 'percent': 0, 'message': 'Waiting...'})}\n\n"
        time.sleep(0.3)


# ---------------------------
# Helpers
# ---------------------------
def _load_voices():
    if not VOICES_JSON.exists():
        return []
    with VOICES_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("voices", [])


def _get_voice(voice_id: str):
    for v in _load_voices():
        if v.get("id") == voice_id:
            return v
    return None


def _model_ready() -> bool:
    return MODEL_FILE.exists() and VOCAB_FILE.exists()


def _ensure_dirs():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _download_file(url: str, target: Path, task_id: str, start_percent: int, end_percent: int):
    log(f"Downloading {url} -> {target}")
    add_task_log(task_id, f"Downloading {url}")
    with urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        downloaded = 0
        chunk_size = 1024 * 1024
        with target.open("wb") as f:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    percent = start_percent + int((downloaded / total) * (end_percent - start_percent))
                else:
                    percent = start_percent + int((downloaded / (50 * 1024 * 1024)) * (end_percent - start_percent))
                percent = min(end_percent, max(start_percent, percent))
                set_progress(task_id, "downloading", percent, "Downloading model files...")


def _run_f5_tts(task_id: str, voice_id: str, text: str, speed: float, cfg_strength: float, nfe_step: int, remove_silence: bool):
    import subprocess

    if not _model_ready():
        set_progress(task_id, "error", 0, "Model not downloaded")
        return

    voice = _get_voice(voice_id)
    if not voice:
        set_progress(task_id, "error", 0, f"Voice not found: {voice_id}")
        return

    ref_audio = VOICE_REF_DIR / voice["ref_audio"]
    ref_text = voice.get("ref_text", "")
    if not ref_audio.exists():
        set_progress(task_id, "error", 0, f"Reference audio not found: {ref_audio}")
        return

    output_name = f"voice_clone_{int(time.time())}.wav"
    output_path = TEMP_DIR / output_name

    cmd = [
        sys.executable,
        "-m",
        "f5_tts.infer.infer_cli",
        "--model",
        "F5TTS_Base",
        "--ref_audio",
        str(ref_audio),
        "--ref_text",
        ref_text,
        "--gen_text",
        text,
        "--speed",
        str(speed),
        "--cfg_strength",
        str(cfg_strength),
        "--nfe_step",
        str(nfe_step),
        "--vocoder_name",
        "vocos",
        "--ckpt_file",
        str(MODEL_FILE),
        "--vocab_file",
        str(VOCAB_FILE),
        "--output_dir",
        str(TEMP_DIR),
        "--output_file",
        output_name,
    ]
    if remove_silence:
        cmd.append("--remove_silence")

    log(f"Starting F5-TTS: voice={voice_id}, text_len={len(text)}")
    add_task_log(task_id, f"Command: {' '.join(cmd)}")
    set_progress(task_id, "starting", 0, "Starting TTS...")

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    percent = 5
    set_progress(task_id, "initializing", percent, "Initializing model...")

    if proc.stdout:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            add_task_log(task_id, line)
            log(line)
            # Heuristic progress parsing
            if "Using" in line:
                percent = 15
                set_progress(task_id, "loading", percent, "Loading model...")
            if "Voice:" in line:
                percent = 30
                set_progress(task_id, "generating", percent, "Generating audio...")
            if "%" in line:
                try:
                    p = int(line.split("%")[0].split()[-1])
                    percent = 30 + int((p / 100) * 60)
                    set_progress(task_id, "generating", percent, "Generating audio...")
                except Exception:
                    pass

    proc.wait()
    if proc.returncode != 0:
        set_progress(task_id, "error", 0, "TTS process failed")
        return

    if not output_path.exists():
        set_progress(task_id, "error", 0, "Output file missing")
        return

    set_progress(task_id, "writing", 90, "Finalizing output...")

    # Compute duration
    duration = None
    try:
        import wave
        with wave.open(str(output_path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            duration = round(frames / float(rate), 2)
    except Exception:
        duration = None

    progress_store[task_id].update(
        {
            "status": "complete",
            "percent": 100,
            "message": "Complete",
            "file_path": str(output_path),
            "filename": output_name,
            "duration": duration,
            "updated": time.time(),
        }
    )


# ---------------------------
# REST endpoints
# ---------------------------
@APP.get("/health")
def health():
    return {"status": "ok", "time": time.time()}


@APP.get("/voice-clone/status")
def status():
    return {
        "venv_ready": True,
        "deps_ready": True,
        "model_ready": _model_ready(),
        "voices_ready": VOICES_JSON.exists(),
        "samples_ready": SAMPLES_DIR.exists(),
    }


@APP.post("/voice-clone/setup")
def setup_runtime():
    task_id = f"setup_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Runtime already configured")
    add_task_log(task_id, "Runtime is managed by Electron startup (uv).")
    set_progress(task_id, "complete", 100, "Runtime ready")
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.post("/voice-clone/model")
def download_model():
    _ensure_dirs()
    task_id = f"model_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Starting model download...")

    def runner():
        try:
            _download_file(HF_MODEL_URL, MODEL_FILE, task_id, 5, 70)
            _download_file(HF_VOCAB_URL, VOCAB_FILE, task_id, 70, 95)
            # Rename config.json -> vocab.txt (already saved as vocab.txt)
            MODEL_MARKER.write_text(json.dumps({"ready": True, "time": time.time()}))
            set_progress(task_id, "complete", 100, "Model ready")
        except Exception as e:
            set_progress(task_id, "error", 0, str(e))

    threading.Thread(target=runner, daemon=True).start()
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.post("/voice-clone/start")
def start(payload: dict):
    text = payload.get("text", "").strip()
    voice_id = payload.get("voice_id")
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if not voice_id:
        raise HTTPException(status_code=400, detail="voice_id is required")

    speed = float(payload.get("speed", 1.0))
    cfg_strength = float(payload.get("cfg_strength", 2.0))
    nfe_step = int(payload.get("nfe_step", 32))
    remove_silence = bool(payload.get("remove_silence", False))

    task_id = f"tts_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Starting generation...")
    threading.Thread(
        target=_run_f5_tts,
        args=(task_id, voice_id, text, speed, cfg_strength, nfe_step, remove_silence),
        daemon=True,
    ).start()

    return {"task_id": task_id}


@APP.get("/voice-clone/progress/{task_id}")
def progress(task_id: str):
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.get("/voice-clone/result/{task_id}")
def result(task_id: str):
    data = progress_store.get(task_id)
    if not data:
        raise HTTPException(status_code=404, detail="task not found")
    return JSONResponse(data)


@APP.get("/voice-clone/download/{task_id}")
def download(task_id: str):
    data = progress_store.get(task_id)
    if not data or not data.get("file_path"):
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(data["file_path"], filename=data.get("filename", "voice.wav"))


@APP.get("/voice-clone/voices")
def voices():
    return {"voices": _load_voices()}


@APP.get("/voice-clone/samples")
def samples():
    if not SAMPLES_DIR.exists():
        return {"samples": []}
    items = []
    for p in sorted(SAMPLES_DIR.glob("*.wav")):
        items.append({"id": p.name, "filename": p.name})
    return {"samples": items}


@APP.get("/voice-clone/samples/{sample_id}")
def sample_file(sample_id: str):
    p = SAMPLES_DIR / sample_id
    if not p.exists():
        raise HTTPException(status_code=404, detail="sample not found")
    return FileResponse(str(p), filename=p.name)


@APP.get("/voice-clone/logs/info")
def logs_info():
    size = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    return {"path": str(LOG_FILE), "size": size}


@APP.post("/voice-clone/logs/clear")
def logs_clear():
    try:
        if LOG_FILE.exists():
            LOG_FILE.unlink()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", action="store_true", default=True)
    parser.add_argument("--port", type=int, default=8188)
    args = parser.parse_args()

    log("Voice Clone server starting...")
    log(f"Assets root: {ASSETS_ROOT}")
    log(f"Voices JSON: {VOICES_JSON}")
    log(f"Model dir: {MODEL_DIR}")
    log(f"Temp dir: {TEMP_DIR}")
    log(f"Server URL: http://127.0.0.1:{args.port}")

    import uvicorn
    uvicorn.run(APP, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
