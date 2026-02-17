from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR, MODEL_VIENEU_DIR
from python_api.common.progress import ProgressStore
from python_api.common.jobs import JobStore


_service_root = Path(__file__).resolve().parents[2]
if str(_service_root) not in sys.path:
    sys.path.insert(0, str(_service_root))


VIENEU_MODEL_DIR = MODEL_VIENEU_DIR
VIENEU_BACKBONE_DIR = VIENEU_MODEL_DIR / "backbone"
VIENEU_CODEC_DIR = VIENEU_MODEL_DIR / "codec"

_SAMPLE_CONFIG_ROOT = _service_root / "vieneu-tts-sample"

VIENEU_TTS_ROOT = Path(os.environ.get("VIENEU_TTS_ROOT", "")).resolve() if os.environ.get("VIENEU_TTS_ROOT") else None
if VIENEU_TTS_ROOT is None or not VIENEU_TTS_ROOT.exists():
    VIENEU_TTS_ROOT = _service_root
    if not (VIENEU_TTS_ROOT / "config.yaml").exists():
        VIENEU_TTS_ROOT = _SAMPLE_CONFIG_ROOT

progress_store = ProgressStore()
_engine_lock = threading.Lock()
_loading_in_progress = False
tts_engine = None
model_loaded = False
current_config: Dict[str, Any] = {}
task_files: Dict[str, str] = {}
_ref_code_cache: Dict[str, Any] = {}
_config_cache: Optional[Dict[str, Any]] = None
_config_mtime: float = 0


def _get_or_encode_reference(audio_path: str) -> Any:
    """Cache reference voice codes to avoid re-encoding on repeated requests."""
    global _ref_code_cache
    if audio_path in _ref_code_cache:
        return _ref_code_cache[audio_path]
    ref_codes = tts_engine.encode_reference(audio_path)
    _ref_code_cache[audio_path] = ref_codes
    return ref_codes


def _load_config() -> Dict[str, Any]:
    global _config_cache, _config_mtime
    config_path = VIENEU_TTS_ROOT / "config.yaml"
    if not config_path.exists():
        return {}
    try:
        mtime = config_path.stat().st_mtime
        if _config_cache is not None and mtime == _config_mtime:
            return _config_cache

        import yaml

        with open(config_path, "r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle) or {}

        if not config.get("voice_samples") and _SAMPLE_CONFIG_ROOT.exists():
            sample_config_path = _SAMPLE_CONFIG_ROOT / "config.yaml"
            if sample_config_path.exists():
                with open(sample_config_path, "r", encoding="utf-8") as sample_handle:
                    sample_config = yaml.safe_load(sample_handle) or {}
                if sample_config.get("voice_samples"):
                    config["voice_samples"] = sample_config["voice_samples"]
                if not config.get("text_settings") and sample_config.get("text_settings"):
                    config["text_settings"] = sample_config["text_settings"]

        if config.get("voice_samples"):
            for _, voice_info in config["voice_samples"].items():
                if "audio" in voice_info:
                    audio_path = Path(voice_info["audio"])
                    if not audio_path.is_absolute():
                        audio_path = _service_root / voice_info["audio"]
                    voice_info["audio"] = str(audio_path)

                if "text" in voice_info:
                    text_path = Path(voice_info["text"])
                    if not text_path.is_absolute():
                        text_path = _service_root / voice_info["text"]
                    voice_info["text"] = str(text_path)

        _config_cache = config
        _config_mtime = mtime
        return config
    except Exception as exc:
        log(f"Failed to load VieNeu config: {exc}", "error", log_name="vieneu-tts.log")
        return {}


def get_model_configs() -> Dict[str, Any]:
    config = _load_config()
    return {
        "backbones": config.get("backbone_configs", {}),
        "codecs": config.get("codec_configs", {}),
    }


def get_voices(language: str = "vi") -> Dict[str, Any]:
    config = _load_config()
    voice_samples = config.get("voice_samples", {})
    voices = []
    for vid, vinfo in voice_samples.items():
        voices.append(
            {
                "id": vid,
                "name": vinfo.get("name", vid),
                "description": vinfo.get("description", ""),
                "language": language,
            }
        )
    return {"voices": voices}


def model_status() -> dict:
    with _engine_lock:
        loaded = bool(model_loaded)
        config_snapshot = dict(current_config)
    return {
        "model_dir": str(VIENEU_MODEL_DIR),
        "backbone_dir": str(VIENEU_BACKBONE_DIR),
        "codec_dir": str(VIENEU_CODEC_DIR),
        "backbone_ready": VIENEU_BACKBONE_DIR.exists() and any(VIENEU_BACKBONE_DIR.iterdir()),
        "codec_ready": VIENEU_CODEC_DIR.exists() and any(VIENEU_CODEC_DIR.iterdir()),
        "model_loaded": loaded,
        "current_config": config_snapshot,
    }


def download_model(job_store: JobStore, backbone: str, codec: str) -> str:
    task_id = f"tts_dl_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Starting model download...")

    def runner() -> None:
        try:
            config = _load_config()
            backbones = config.get("backbone_configs", {})
            codecs = config.get("codec_configs", {})
            if backbone not in backbones or codec not in codecs:
                progress_store.set_progress(task_id, "error", 0, "Invalid backbone or codec")
                return

            backbone_repo = backbones[backbone]["repo"]
            codec_repo = codecs[codec]["repo"]

            progress_store.set_progress(task_id, "downloading", 10, f"Downloading backbone {backbone}...")
            if not _ensure_model_downloaded(backbone_repo, VIENEU_BACKBONE_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download backbone")
                return

            progress_store.set_progress(task_id, "downloading", 55, f"Downloading codec {codec}...")
            if not _ensure_model_downloaded(codec_repo, VIENEU_CODEC_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download codec")
                return

            progress_store.set_progress(task_id, "complete", 100, "Model download complete")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS model download failed: {exc}", "error", log_name="vieneu-tts.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def load_model(job_store: JobStore, backbone: str, codec: str, device: str = "auto") -> str:
    task_id = f"tts_load_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Loading model...")

    def runner() -> None:
        global tts_engine, model_loaded, current_config, _ref_code_cache, _loading_in_progress
        # If a load is already in progress (e.g. from startup prewarm), wait for it
        waited = False
        while True:
            with _engine_lock:
                if not _loading_in_progress:
                    _loading_in_progress = True
                    break
            if not waited:
                progress_store.set_progress(task_id, "loading", 10, "Waiting for current load to finish...")
                waited = True
            time.sleep(0.5)

        # Resolve the requested device
        import torch
        if device == "auto":
            requested_device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            requested_device = device

        # If model was loaded by the other thread while we waited, check device match
        with _engine_lock:
            if waited and model_loaded and tts_engine is not None:
                if current_config.get("device") == requested_device:
                    _loading_in_progress = False
                    progress_store.set_progress(task_id, "complete", 100, "Model already loaded")
                    return
                # Device mismatch — fall through to reload on the requested device

        try:
            config = _load_config()
            backbones = config.get("backbone_configs", {})
            codecs = config.get("codec_configs", {})

            if backbone not in backbones or codec not in codecs:
                progress_store.set_progress(task_id, "error", 0, "Invalid backbone or codec")
                return

            backbone_repo = backbones[backbone]["repo"]
            codec_repo = codecs[codec]["repo"]

            progress_store.set_progress(task_id, "downloading", 20, "Checking backbone model...")
            if not _ensure_model_downloaded(backbone_repo, VIENEU_BACKBONE_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download backbone model")
                return

            progress_store.set_progress(task_id, "downloading", 30, "Checking codec model...")
            if not _ensure_model_downloaded(codec_repo, VIENEU_CODEC_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download codec model")
                return

            progress_store.set_progress(task_id, "loading", 40, f"Initializing TTS engine on {requested_device}...")

            bb_device = requested_device
            cc_device = "cpu" if "ONNX" in codec else requested_device

            new_engine = _load_tts_engine(str(VIENEU_BACKBONE_DIR), codec_repo, bb_device, cc_device)

            with _engine_lock:
                if model_loaded and tts_engine is not None:
                    del tts_engine
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                tts_engine = new_engine
                model_loaded = True
                _ref_code_cache.clear()
                current_config = {
                    "backbone": backbone,
                    "codec": codec,
                    "device": bb_device,
                    "voice_samples": config.get("voice_samples", {}),
                    "max_chars_per_chunk": config.get("text_settings", {}).get("max_chars_per_chunk", 256),
                }
            progress_store.set_progress(task_id, "complete", 100, "Model loaded")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS model load failed: {exc}", "error", log_name="vieneu-tts.log")
        finally:
            with _engine_lock:
                _loading_in_progress = False

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def unload_model() -> None:
    global tts_engine, model_loaded, current_config, _ref_code_cache
    with _engine_lock:
        if tts_engine is not None:
            try:
                import torch

                del tts_engine
                tts_engine = None
                model_loaded = False
                current_config = {}
                _ref_code_cache.clear()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                log("TTS model unloaded successfully", "info", log_name="vieneu-tts.log")
            except Exception as exc:
                log(f"Error unloading TTS model: {exc}", "error", log_name="vieneu-tts.log")


def _get_backbone_path() -> Optional[str]:
    if (VIENEU_MODEL_DIR / "model.safetensors").exists():
        log(f"Using backbone from {VIENEU_MODEL_DIR}", "info", log_name="vieneu-tts.log")
        return str(VIENEU_MODEL_DIR)

    if (VIENEU_BACKBONE_DIR / "model.safetensors").exists():
        log(f"Using backbone from {VIENEU_BACKBONE_DIR}", "info", log_name="vieneu-tts.log")
        return str(VIENEU_BACKBONE_DIR)

    return None


def _load_tts_engine(backbone_path: str, codec_repo: str, backbone_device: str, codec_device: str) -> Any:
    import warnings
    from vieneu import VieNeuTTS

    # Suppress the massive number of "copying from a non-meta parameter" warnings
    # that PyTorch emits when loading state dicts with meta tensors.
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*copying from a non-meta parameter.*")
        return VieNeuTTS(
            backbone_repo=backbone_path,
            backbone_device=backbone_device,
            codec_repo=codec_repo,
            codec_device=codec_device,
        )


def _ensure_model_downloaded(repo_id: str, local_dir: Path) -> bool:
    try:
        if local_dir.exists() and any(local_dir.iterdir()):
            has_config = (local_dir / "config.json").exists()
            has_model = any(local_dir.glob("*.bin")) or any(local_dir.glob("*.safetensors"))
            if has_config or has_model:
                log(f"Model already exists at {local_dir}", "info", log_name="vieneu-tts.log")
                return True
            log(f"Directory exists but no model files found at {local_dir}, re-downloading...", "warning", log_name="vieneu-tts.log")

        log(f"Downloading model {repo_id} to {local_dir}...", "info", log_name="vieneu-tts.log")
        from huggingface_hub import snapshot_download

        local_dir.parent.mkdir(parents=True, exist_ok=True)
        snapshot_download(repo_id=repo_id, local_dir=str(local_dir), local_dir_use_symlinks=False)
        log(f"Model downloaded successfully to {local_dir}", "info", log_name="vieneu-tts.log")
        return True
    except Exception as exc:
        log(f"Failed to download model {repo_id}: {exc}", "error", log_name="vieneu-tts.log")
        return False


def _ensure_model_loaded() -> bool:
    global tts_engine, model_loaded, current_config, _loading_in_progress

    with _engine_lock:
        if model_loaded and tts_engine is not None:
            return True
        if _loading_in_progress:
            log("Model loading already in progress, skipping", "info", log_name="vieneu-tts.log")
            return False
        _loading_in_progress = True

    try:
        config = _load_config()
        backbones = config.get("backbone_configs", {})
        codecs = config.get("codec_configs", {})

        if not backbones or not codecs:
            log("No TTS model configs available", "error", log_name="vieneu-tts.log")
            return False

        default_backbone = list(backbones.keys())[0]
        default_codec = list(codecs.keys())[0]

        backbone_repo = backbones[default_backbone]["repo"]
        codec_repo = codecs[default_codec]["repo"]

        log(f"Auto-loading TTS model: {default_backbone} + {default_codec}", "info", log_name="vieneu-tts.log")

        backbone_path = _get_backbone_path()

        if not backbone_path:
            if not _ensure_model_downloaded(backbone_repo, VIENEU_BACKBONE_DIR):
                log(f"Failed to download backbone model: {backbone_repo}", "error", log_name="vieneu-tts.log")
                return False
            backbone_path = str(VIENEU_BACKBONE_DIR)

        if not _ensure_model_downloaded(codec_repo, VIENEU_CODEC_DIR):
            log(f"Failed to download codec model: {codec_repo}", "error", log_name="vieneu-tts.log")
            return False

        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        codec_device = "cpu" if "ONNX" in default_codec else device

        new_engine = _load_tts_engine(backbone_path, codec_repo, device, codec_device)

        with _engine_lock:
            tts_engine = new_engine
            model_loaded = True
            current_config = {
                "backbone": default_backbone,
                "codec": default_codec,
                "device": device,
                "voice_samples": config.get("voice_samples", {}),
                "max_chars_per_chunk": config.get("text_settings", {}).get("max_chars_per_chunk", 256),
            }
        log("TTS model loaded successfully", "info", log_name="vieneu-tts.log")
        return True
    except Exception as exc:
        log(f"Failed to auto-load TTS model: {exc}", "error", log_name="vieneu-tts.log")
        return False
    finally:
        with _engine_lock:
            _loading_in_progress = False


def generate(
    job_store: JobStore,
    text: str,
    mode: str,
    voice_id: Optional[str],
    sample_voice_id: Optional[str],
    sample_text_id: Optional[str],
) -> str:
    task_id = f"tts_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Starting generation...")

    def runner() -> None:
        try:
            with _engine_lock:
                if not model_loaded or tts_engine is None:
                    need_load = True
                else:
                    need_load = False
            if need_load:
                progress_store.set_progress(task_id, "loading", 10, "Loading model...")
                if not _ensure_model_loaded():
                    progress_store.set_progress(task_id, "error", 0, "Failed to load model")
                    return

            from vieneu_utils.core_utils import split_text_into_chunks
            import numpy as np
            import soundfile as sf
            import torch

            with _engine_lock:
                engine = tts_engine
                config_snap = dict(current_config)
            voice_samples = config_snap.get("voice_samples", {})
            if mode == "preset":
                if not voice_id or voice_id not in voice_samples:
                    progress_store.set_progress(task_id, "error", 0, "Voice not found")
                    return
                voice_info = voice_samples[voice_id]
                ref_audio_path = voice_info["audio"]
                text_path = voice_info["text"]
                if not os.path.exists(ref_audio_path):
                    progress_store.set_progress(task_id, "error", 0, "Reference audio not found")
                    return
                with open(text_path, "r", encoding="utf-8") as handle:
                    ref_text_raw = handle.read().strip()
                ref_codes = _get_or_encode_reference(ref_audio_path)
            else:
                if not sample_voice_id or not sample_text_id:
                    progress_store.set_progress(task_id, "error", 0, "Sample IDs required")
                    return
                sample_voice_dir = VIENEU_TTS_ROOT / "static" / "sample_voice"
                sample_text_dir = VIENEU_TTS_ROOT / "static" / "sample_text"
                ref_audio_path = sample_voice_dir / f"{sample_voice_id}.wav"
                ref_text_path = sample_text_dir / f"{sample_text_id}.txt"
                if not ref_audio_path.exists() or not ref_text_path.exists():
                    progress_store.set_progress(task_id, "error", 0, "Sample not found")
                    return
                ref_text_raw = ref_text_path.read_text(encoding="utf-8").strip()
                ref_codes = _get_or_encode_reference(str(ref_audio_path))

            if isinstance(ref_codes, torch.Tensor):
                ref_codes = ref_codes.cpu().numpy()

            max_chars = config_snap.get("max_chars_per_chunk", 256)
            chunks = split_text_into_chunks(text, max_chars=max_chars)
            total = len(chunks)
            all_segments = []
            sr = 24000
            silence_pad = np.zeros(int(sr * 0.15), dtype=np.float32)

            for idx, chunk in enumerate(chunks):
                percent = 20 + int((idx / max(total, 1)) * 60)
                progress_store.set_progress(task_id, "generating", percent, f"Generating {idx + 1}/{total}")
                wav = engine.infer(chunk, ref_codes=ref_codes, ref_text=ref_text_raw)
                if wav is not None and len(wav) > 0:
                    all_segments.append(wav)
                    if idx < total - 1:
                        all_segments.append(silence_pad)

            if not all_segments:
                progress_store.set_progress(task_id, "error", 0, "Failed to generate audio")
                return

            final_wav = np.concatenate(all_segments)
            filename = f"tts_{int(time.time() * 1000)}.wav"
            output_path = TEMP_DIR / filename
            sf.write(str(output_path), final_wav, sr)

            file_record = job_store.add_file(output_path, filename)
            task_files[task_id] = file_record.file_id
            progress_store.set_progress(task_id, "complete", 100, "Complete")
            progress_store.add_log(task_id, json.dumps({"download_url": f"/api/v1/files/{file_record.file_id}"}))

        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS generate failed: {exc}", "error", log_name="vieneu-tts.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_download_file_id(task_id: str) -> Optional[str]:
    return task_files.get(task_id)
