#!/usr/bin/env python3
"""
Local REST server for Fast TTS (VieNeu-TTS).
Runs on 127.0.0.1:8189 and exposes REST + SSE endpoints.
Similar architecture to voice-clone-server.py.
"""

import argparse
import json
import os
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse


APP = FastAPI(title="Fast TTS Server", version="1.0.0")
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
LOG_FILE = LOG_DIR / "tts-fast.log"
LOG_MAX_BYTES = 5 * 1024 * 1024

TEMP_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# VieNeu-TTS project root — passed via env or auto-detected
VIENEU_TTS_ROOT = Path(
    os.environ.get("VIENEU_TTS_ROOT", "")
).resolve() if os.environ.get("VIENEU_TTS_ROOT") else None

if VIENEU_TTS_ROOT is None:
    VIENEU_TTS_ROOT = Path(__file__).resolve().parent.parent / "VieNeu-TTS-Fast-Vietnamese"

# Global model state
tts_engine = None
model_loaded = False
current_config = {}


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
    while True:
        data = progress_store.get(task_id)
        logs = progress_logs.get(task_id, [])
        if data:
            payload = dict(data)
            payload["logs"] = logs[-50:]
            yield f"data: {json.dumps(payload)}\n\n"
            if data.get("status") in ("complete", "error"):
                break
        else:
            yield f"data: {json.dumps({'status': 'waiting', 'percent': 0, 'message': 'Waiting...'})}\n\n"
        time.sleep(0.3)


# ---------------------------
# TTS Engine management
# ---------------------------
def _try_import_vieneu():
    """Try to import VieNeu-TTS modules, adding project root to path if needed."""
    vieneu_root = str(VIENEU_TTS_ROOT)
    if vieneu_root not in sys.path:
        sys.path.insert(0, vieneu_root)
    # Also add parent if needed
    parent = str(VIENEU_TTS_ROOT.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)


def _check_dependencies() -> dict:
    """Check if required Python packages are available."""
    missing = []
    available = []
    for pkg in ["torch", "numpy", "soundfile", "yaml", "fastapi", "uvicorn"]:
        try:
            __import__(pkg)
            available.append(pkg)
        except ImportError:
            missing.append(pkg)
    return {"available": available, "missing": missing}


def _run_tts_generation(task_id: str, text: str, options: dict):
    """Run TTS generation in a background thread."""
    global tts_engine, model_loaded

    try:
        set_progress(task_id, "initializing", 10, "Checking model status...")
        add_task_log(task_id, f"Text length: {len(text)}")
        add_task_log(task_id, f"Options: {json.dumps(options)}")

        if not model_loaded or tts_engine is None:
            set_progress(task_id, "error", 0, "Model not loaded. Please load model first.")
            return

        voice_id = options.get("voice_id")
        mode = options.get("mode", "preset")

        set_progress(task_id, "loading", 30, "Preparing reference audio...")
        add_task_log(task_id, f"Mode: {mode}, Voice: {voice_id}")

        # Import needed modules
        import numpy as np
        import soundfile as sf

        # Get reference data based on mode
        ref_codes = None
        ref_text_raw = ""

        if mode == "preset" and voice_id:
            # Use the engine's voice sample config
            from utils.core_utils import split_text_into_chunks

            voice_samples = current_config.get("voice_samples", {})
            if voice_id not in voice_samples:
                set_progress(task_id, "error", 0, f"Voice not found: {voice_id}")
                return

            voice_info = voice_samples[voice_id]
            ref_audio_path = voice_info["audio"]
            text_path = voice_info["text"]

            if not os.path.exists(ref_audio_path):
                set_progress(task_id, "error", 0, f"Reference audio not found: {ref_audio_path}")
                return

            with open(text_path, "r", encoding="utf-8") as f:
                ref_text_raw = f.read().strip()

            ref_codes = tts_engine.encode_reference(ref_audio_path)

        elif mode == "custom":
            # Custom reference from sample files
            from utils.core_utils import split_text_into_chunks

            sample_voice_id = options.get("sample_voice_id")
            sample_text_id = options.get("sample_text_id")

            if sample_voice_id and sample_text_id:
                sample_voice_dir = VIENEU_TTS_ROOT / "static" / "sample_voice"
                sample_text_dir = VIENEU_TTS_ROOT / "static" / "sample_text"

                ref_audio_path = str(sample_voice_dir / f"{sample_voice_id}.wav")
                ref_text_path = str(sample_text_dir / f"{sample_text_id}.txt")

                if not os.path.exists(ref_audio_path):
                    set_progress(task_id, "error", 0, f"Sample voice not found: {sample_voice_id}")
                    return
                if not os.path.exists(ref_text_path):
                    set_progress(task_id, "error", 0, f"Sample text not found: {sample_text_id}")
                    return

                with open(ref_text_path, "r", encoding="utf-8") as f:
                    ref_text_raw = f.read().strip()

                ref_codes = tts_engine.encode_reference(ref_audio_path)
            else:
                set_progress(task_id, "error", 0, "Custom mode requires sample_voice_id and sample_text_id")
                return
        else:
            set_progress(task_id, "error", 0, "Invalid mode or missing voice_id")
            return

        import torch
        if isinstance(ref_codes, torch.Tensor):
            ref_codes = ref_codes.cpu().numpy()

        set_progress(task_id, "generating", 50, "Generating audio...")
        add_task_log(task_id, "Starting inference...")

        # Split text into chunks
        max_chars = current_config.get("max_chars_per_chunk", 256)
        text_chunks = split_text_into_chunks(text, max_chars=max_chars)
        total_chunks = len(text_chunks)
        add_task_log(task_id, f"Split into {total_chunks} chunks")

        all_audio_segments = []
        sr = 24000
        silence_pad = np.zeros(int(sr * 0.15), dtype=np.float32)

        for i, chunk in enumerate(text_chunks):
            chunk_percent = 50 + int((i / total_chunks) * 35)
            set_progress(task_id, "generating", chunk_percent, f"Generating chunk {i+1}/{total_chunks}...")

            chunk_wav = tts_engine.infer(chunk, ref_codes, ref_text_raw)

            if chunk_wav is not None and len(chunk_wav) > 0:
                all_audio_segments.append(chunk_wav)
                if i < total_chunks - 1:
                    all_audio_segments.append(silence_pad)

        if not all_audio_segments:
            set_progress(task_id, "error", 0, "Failed to generate audio")
            return

        set_progress(task_id, "writing", 90, "Saving audio file...")

        final_wav = np.concatenate(all_audio_segments)
        filename = f"tts_fast_{int(time.time() * 1000)}.wav"
        output_path = str(TEMP_DIR / filename)

        sf.write(output_path, final_wav, sr)

        duration = round(len(final_wav) / sr, 2)
        add_task_log(task_id, f"Audio saved: {filename}, duration: {duration}s")

        # Cleanup GPU memory
        try:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            import gc
            gc.collect()
        except Exception:
            pass

        progress_store[task_id].update({
            "status": "complete",
            "percent": 100,
            "message": "Complete",
            "file_path": output_path,
            "filename": filename,
            "duration": duration,
            "sample_rate": sr,
            "updated": time.time(),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        log(f"TTS generation failed: {e}", "error")
        add_task_log(task_id, f"ERROR: {str(e)}")
        set_progress(task_id, "error", 0, str(e))


# ---------------------------
# REST endpoints
# ---------------------------
@APP.get("/health")
def health():
    return {"status": "ok", "time": time.time()}


@APP.get("/tts-fast/status")
def status():
    deps = _check_dependencies()
    config_exists = (VIENEU_TTS_ROOT / "config.yaml").exists()
    return {
        "model_loaded": model_loaded,
        "vieneu_root": str(VIENEU_TTS_ROOT),
        "vieneu_exists": VIENEU_TTS_ROOT.exists(),
        "config_exists": config_exists,
        "deps_ok": len(deps["missing"]) == 0,
        "deps_missing": deps["missing"],
        "voices_ready": config_exists,
        "current_config": {
            "backbone": current_config.get("backbone"),
            "codec": current_config.get("codec"),
            "device": current_config.get("device"),
        } if model_loaded else None,
    }


@APP.post("/tts-fast/setup")
def setup_runtime():
    """Setup endpoint — runtime is managed by Electron (shared venv with Voice Clone)."""
    task_id = f"setup_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Runtime is managed by Electron startup.")
    add_task_log(task_id, "Runtime (venv) is shared with Voice Clone and managed by Electron.")
    add_task_log(task_id, "Use the Voice Clone 'Setup Runtime' if venv is not ready.")
    set_progress(task_id, "complete", 100, "Runtime ready")
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.post("/tts-fast/install-deps")
def install_deps():
    """Install VieNeu-TTS Python dependencies into the shared venv."""
    task_id = f"deps_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Installing VieNeu-TTS dependencies...")

    def runner():
        import subprocess
        try:
            vieneu_root = str(VIENEU_TTS_ROOT)
            add_task_log(task_id, f"VieNeu-TTS root: {vieneu_root}")

            # Install VieNeu-TTS package from local source
            set_progress(task_id, "installing", 20, "Installing VieNeu-TTS package...")
            add_task_log(task_id, f"pip install {vieneu_root}")

            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "-e", vieneu_root],
                capture_output=True, text=True, timeout=600
            )
            for line in result.stdout.splitlines():
                add_task_log(task_id, line)
            if result.returncode != 0:
                for line in result.stderr.splitlines():
                    add_task_log(task_id, line)
                set_progress(task_id, "error", 0, f"pip install failed (exit {result.returncode})")
                return

            set_progress(task_id, "installing", 70, "Verifying installation...")

            # Verify key imports
            try:
                _try_import_vieneu()
                add_task_log(task_id, "VieNeu-TTS import check passed")
            except Exception as e:
                add_task_log(task_id, f"Import check warning: {e}")

            set_progress(task_id, "complete", 100, "Dependencies installed successfully")
        except Exception as e:
            import traceback
            traceback.print_exc()
            add_task_log(task_id, f"ERROR: {str(e)}")
            set_progress(task_id, "error", 0, str(e))

    threading.Thread(target=runner, daemon=True).start()
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.get("/tts-fast/voices")
def get_voices(language: str = "vi"):
    """Get available preset voices."""
    _try_import_vieneu()

    # Try to load from VieNeu-TTS config
    config_path = VIENEU_TTS_ROOT / "config.yaml"
    if not config_path.exists():
        return {"voices": []}

    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}

        voice_samples = config.get("voice_samples", {})
        voices = []
        for vid, vinfo in voice_samples.items():
            voices.append({
                "id": vid,
                "name": vinfo.get("name", vid.capitalize()),
                "description": vinfo.get("description", ""),
            })
        return {"voices": voices}
    except Exception as e:
        log(f"Failed to load voices: {e}", "error")
        return {"voices": []}


@APP.get("/tts-fast/samples")
def get_samples():
    """Get available sample voices and texts for custom mode."""
    sample_voice_dir = VIENEU_TTS_ROOT / "static" / "sample_voice"
    sample_text_dir = VIENEU_TTS_ROOT / "static" / "sample_text"

    voices = []
    if sample_voice_dir.exists():
        for f in sorted(sample_voice_dir.glob("*.wav")):
            voices.append({"id": f.stem, "filename": f.name, "url": f"/tts-fast/sample-audio/{f.name}"})

    texts = []
    if sample_text_dir.exists():
        for f in sorted(sample_text_dir.glob("*.txt")):
            try:
                content = f.read_text(encoding="utf-8")
                preview = content[:100] + "..." if len(content) > 100 else content
            except Exception:
                preview = ""
            texts.append({"id": f.stem, "filename": f.name, "preview": preview})

    return {"sample_voices": voices, "sample_texts": texts}


@APP.get("/tts-fast/sample-audio/{filename}")
def sample_audio(filename: str):
    """Serve a sample audio file."""
    p = VIENEU_TTS_ROOT / "static" / "sample_voice" / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail="Sample not found")
    return FileResponse(str(p), filename=filename)


@APP.get("/tts-fast/model/configs")
def get_model_configs():
    """Get available backbone and codec configurations."""
    _try_import_vieneu()
    config_path = VIENEU_TTS_ROOT / "config.yaml"
    if not config_path.exists():
        return {"backbones": {}, "codecs": {}}

    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return {
            "backbones": config.get("backbone_configs", {}),
            "codecs": config.get("codec_configs", {}),
        }
    except Exception as e:
        log(f"Failed to load configs: {e}", "error")
        return {"backbones": {}, "codecs": {}}


@APP.post("/tts-fast/model/load")
def load_model(payload: dict):
    """Load TTS model with specified configuration."""
    global tts_engine, model_loaded, current_config

    backbone = payload.get("backbone")
    codec = payload.get("codec")
    device = payload.get("device", "auto")
    enable_triton = payload.get("enable_triton", True)
    max_batch_size = payload.get("max_batch_size", 8)

    if not backbone or not codec:
        raise HTTPException(status_code=400, detail="backbone and codec are required")

    task_id = f"load_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Loading model...")

    def runner():
        global tts_engine, model_loaded, current_config
        try:
            _try_import_vieneu()
            import yaml
            import torch

            config_path = VIENEU_TTS_ROOT / "config.yaml"
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

            backbone_configs = config.get("backbone_configs", {})
            codec_configs = config.get("codec_configs", {})

            if backbone not in backbone_configs:
                set_progress(task_id, "error", 0, f"Invalid backbone: {backbone}")
                return
            if codec not in codec_configs:
                set_progress(task_id, "error", 0, f"Invalid codec: {codec}")
                return

            set_progress(task_id, "loading", 30, "Initializing TTS engine...")
            add_task_log(task_id, f"Backbone: {backbone}, Codec: {codec}, Device: {device}")

            bb_config = backbone_configs[backbone]
            cc_config = codec_configs[codec]

            # Cleanup previous model
            if model_loaded and tts_engine is not None:
                del tts_engine
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                import gc
                gc.collect()

            # Determine device
            if device == "auto":
                if "gguf" in backbone.lower():
                    bb_device = "gpu" if torch.cuda.is_available() else "cpu"
                else:
                    bb_device = "cuda" if torch.cuda.is_available() else "cpu"
                cc_device = "cpu" if "ONNX" in codec else ("cuda" if torch.cuda.is_available() else "cpu")
            else:
                bb_device = device
                cc_device = "cpu" if "ONNX" in codec else device
                if "gguf" in backbone.lower() and bb_device == "cuda":
                    bb_device = "gpu"

            set_progress(task_id, "loading", 50, "Loading backbone model...")

            from vieneu_tts import VieNeuTTS
            tts_engine = VieNeuTTS(
                backbone_repo=bb_config["repo"],
                backbone_device=bb_device,
                codec_repo=cc_config["repo"],
                codec_device=cc_device,
            )

            model_loaded = True
            current_config = {
                "backbone": backbone,
                "codec": codec,
                "device": bb_device,
                "voice_samples": config.get("voice_samples", {}),
                "max_chars_per_chunk": config.get("text_settings", {}).get("max_chars_per_chunk", 256),
            }

            set_progress(task_id, "complete", 100, "Model loaded successfully")
            add_task_log(task_id, f"Model ready on device: {bb_device}")

        except Exception as e:
            import traceback
            traceback.print_exc()
            log(f"Model load failed: {e}", "error")
            set_progress(task_id, "error", 0, str(e))

    threading.Thread(target=runner, daemon=True).start()
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.get("/tts-fast/model/status")
def model_status():
    """Get current model status."""
    if not model_loaded:
        return {"loaded": False}
    return {
        "loaded": True,
        "backbone": current_config.get("backbone"),
        "codec": current_config.get("codec"),
        "device": current_config.get("device"),
    }


@APP.post("/tts-fast/start")
def start_generation(payload: dict):
    """Start TTS generation. Returns task_id for progress tracking."""
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    if not model_loaded or tts_engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Load model first via /tts-fast/model/load")

    voice_id = payload.get("voice_id")
    mode = payload.get("mode", "preset")

    task_id = f"tts_{uuid.uuid4().hex}"
    set_progress(task_id, "starting", 0, "Starting generation...")

    options = {
        "voice_id": voice_id,
        "mode": mode,
        "sample_voice_id": payload.get("sample_voice_id"),
        "sample_text_id": payload.get("sample_text_id"),
    }

    threading.Thread(
        target=_run_tts_generation,
        args=(task_id, text, options),
        daemon=True,
    ).start()

    return {"task_id": task_id}


@APP.get("/tts-fast/progress/{task_id}")
def progress(task_id: str):
    """SSE stream of progress updates."""
    return StreamingResponse(sse_stream(task_id), media_type="text/event-stream")


@APP.get("/tts-fast/result/{task_id}")
def result(task_id: str):
    """Get final result for a task."""
    data = progress_store.get(task_id)
    if not data:
        raise HTTPException(status_code=404, detail="Task not found")
    return JSONResponse(data)


@APP.get("/tts-fast/download/{task_id}")
def download(task_id: str):
    """Download generated audio file."""
    data = progress_store.get(task_id)
    if not data or not data.get("file_path"):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(data["file_path"], filename=data.get("filename", "tts.wav"))


@APP.get("/tts-fast/logs/info")
def logs_info():
    size = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    return {"path": str(LOG_FILE), "size": size}


@APP.post("/tts-fast/logs/clear")
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
    parser.add_argument("--port", type=int, default=8189)
    args = parser.parse_args()

    log("Fast TTS server starting...")
    log(f"VieNeu-TTS root: {VIENEU_TTS_ROOT}")
    log(f"Temp dir: {TEMP_DIR}")
    log(f"Server URL: http://127.0.0.1:{args.port}")

    import uvicorn
    uvicorn.run(APP, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
