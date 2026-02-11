from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure local VieNeu-TTS package is importable (vieneu, vieneu_utils)
_repo_root = Path(__file__).resolve().parents[2]
_vieneu_tts_dir = _repo_root / "python_api" / "VieNeu-TTS"
if _vieneu_tts_dir.exists() and str(_vieneu_tts_dir) not in sys.path:
    sys.path.insert(0, str(_vieneu_tts_dir))

from ..logging import log
from ..psi_server_utils import ProgressStore
from ..settings import TEMP_DIR
from .jobs import JobStore


# Centralized model storage location
APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
MODEL_ROOT = Path(APPDATA) / "psi-ai-content-hub" / "models"
VIENEU_MODEL_DIR = MODEL_ROOT / "vieneu-tts"
VIENEU_BACKBONE_DIR = VIENEU_MODEL_DIR / "backbone"
VIENEU_CODEC_DIR = VIENEU_MODEL_DIR / "codec"

# Config root - prefer bundled sample config
_SAMPLE_CONFIG_ROOT = Path(__file__).resolve().parents[1] / "assets" / "vieneu-tts-sample"

# For backward compatibility, check old locations for config
VIENEU_TTS_ROOT = Path(os.environ.get("VIENEU_TTS_ROOT", "")).resolve() if os.environ.get("VIENEU_TTS_ROOT") else None
if VIENEU_TTS_ROOT is None or not VIENEU_TTS_ROOT.exists():
    # Prefer the bundled VieNeu-TTS repo
    VIENEU_TTS_ROOT = Path(__file__).resolve().parents[1] / "VieNeu-TTS"
    if not VIENEU_TTS_ROOT.exists():
        # Fallback to sample assets
        VIENEU_TTS_ROOT = _SAMPLE_CONFIG_ROOT
        if not VIENEU_TTS_ROOT.exists():
            # Fallback to old location
            VIENEU_TTS_ROOT = Path(__file__).resolve().parents[2] / "VieNeu-TTS-Fast-Vietnamese"

progress_store = ProgressStore()
tts_engine = None
model_loaded = False
current_config: Dict[str, Any] = {}
task_files: Dict[str, str] = {}


def _load_config() -> Dict[str, Any]:
    config_path = VIENEU_TTS_ROOT / "config.yaml"
    if not config_path.exists():
        return {}
    try:
        import yaml

        with open(config_path, "r", encoding="utf-8") as handle:
            config = yaml.safe_load(handle) or {}

        # Merge in bundled voice samples if VieNeu config doesn't include them
        if not config.get("voice_samples") and _SAMPLE_CONFIG_ROOT.exists():
            sample_config_path = _SAMPLE_CONFIG_ROOT / "config.yaml"
            if sample_config_path.exists():
                with open(sample_config_path, "r", encoding="utf-8") as sample_handle:
                    sample_config = yaml.safe_load(sample_handle) or {}
                if sample_config.get("voice_samples"):
                    config["voice_samples"] = sample_config["voice_samples"]
                if not config.get("text_settings") and sample_config.get("text_settings"):
                    config["text_settings"] = sample_config["text_settings"]
        
        # Fix relative paths in voice_samples to be absolute
        if config.get("voice_samples"):
            for voice_id, voice_info in config["voice_samples"].items():
                if "audio" in voice_info:
                    audio_path = Path(voice_info["audio"])
                    if not audio_path.is_absolute():
                        # Make path relative to project root
                        audio_path = Path(__file__).resolve().parents[2] / voice_info["audio"]
                    voice_info["audio"] = str(audio_path)
                
                if "text" in voice_info:
                    text_path = Path(voice_info["text"])
                    if not text_path.is_absolute():
                        # Make path relative to project root
                        text_path = Path(__file__).resolve().parents[2] / voice_info["text"]
                    voice_info["text"] = str(text_path)
        
        return config
    except Exception as exc:
        log(f"Failed to load VieNeu config: {exc}", "error")
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
            log(f"TTS model download failed: {exc}", "error")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def load_model(job_store: JobStore, backbone: str, codec: str, device: str = "auto") -> str:
    task_id = f"tts_load_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Loading model...")

    def runner() -> None:
        global tts_engine, model_loaded, current_config
        try:
            config = _load_config()
            backbones = config.get("backbone_configs", {})
            codecs = config.get("codec_configs", {})
            
            if backbone not in backbones or codec not in codecs:
                progress_store.set_progress(task_id, "error", 0, "Invalid backbone or codec")
                return

            backbone_repo = backbones[backbone]["repo"]
            codec_repo = codecs[codec]["repo"]
            
            # Ensure models are downloaded
            progress_store.set_progress(task_id, "downloading", 20, "Checking backbone model...")
            if not _ensure_model_downloaded(backbone_repo, VIENEU_BACKBONE_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download backbone model")
                return
            
            progress_store.set_progress(task_id, "downloading", 30, "Checking codec model...")
            if not _ensure_model_downloaded(codec_repo, VIENEU_CODEC_DIR):
                progress_store.set_progress(task_id, "error", 0, "Failed to download codec model")
                return

            progress_store.set_progress(task_id, "loading", 40, "Initializing TTS engine...")
            
            # Unload existing model if loaded
            if model_loaded and tts_engine is not None:
                import torch
                del tts_engine
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            # Determine devices
            import torch
            if device == "auto":
                bb_device = "cuda" if torch.cuda.is_available() else "cpu"
                cc_device = "cpu" if "ONNX" in codec else ("cuda" if torch.cuda.is_available() else "cpu")
            else:
                bb_device = device
                cc_device = "cpu" if "ONNX" in codec else device

            # Load TTS engine
            tts_engine = _load_tts_engine(str(VIENEU_BACKBONE_DIR), codec_repo, bb_device, cc_device)
            
            model_loaded = True
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
            log(f"TTS model load failed: {exc}", "error")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def unload_model() -> None:
    """Unload the TTS model to free memory."""
    global tts_engine, model_loaded, current_config
    if tts_engine is not None:
        try:
            import torch
            del tts_engine
            tts_engine = None
            model_loaded = False
            current_config = {}
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            log("TTS model unloaded successfully", "info")
        except Exception as exc:
            log(f"Error unloading TTS model: {exc}", "error")


def _get_backbone_path() -> Optional[str]:
    """
    Determine the backbone model path.
    Checks multiple locations in priority order.
    Returns the path if found, None otherwise.
    """
    # Priority 1: Main vieneu-tts directory (from tools_manager download)
    if (VIENEU_MODEL_DIR / "model.safetensors").exists():
        log(f"Using backbone from {VIENEU_MODEL_DIR}", "info")
        return str(VIENEU_MODEL_DIR)
    
    # Priority 2: Backbone subdirectory
    if (VIENEU_BACKBONE_DIR / "model.safetensors").exists():
        log(f"Using backbone from {VIENEU_BACKBONE_DIR}", "info")
        return str(VIENEU_BACKBONE_DIR)
    
    return None


def _load_tts_engine(backbone_path: str, codec_repo: str, backbone_device: str, codec_device: str) -> Any:
    """
    Load the VieNeuTTS engine with specified configuration.
    
    Args:
        backbone_path: Local path to backbone model
        codec_repo: Codec repository ID (must be repo ID due to match statement)
        backbone_device: Device for backbone ('cpu', 'cuda')
        codec_device: Device for codec ('cpu', 'cuda')
    
    Returns:
        Loaded VieNeuTTS engine instance
    """
    from vieneu import VieNeuTTS
    
    return VieNeuTTS(
        backbone_repo=backbone_path,
        backbone_device=backbone_device,
        codec_repo=codec_repo,  # Must use repo ID for codec
        codec_device=codec_device,
    )


def _ensure_model_downloaded(repo_id: str, local_dir: Path) -> bool:
    """
    Ensure model is downloaded to local directory.
    Returns True if model exists or was successfully downloaded.
    """
    try:
        # Check if model already exists with actual model files
        if local_dir.exists() and any(local_dir.iterdir()):
            # Verify it has model files (config.json or .bin/.safetensors files)
            has_config = (local_dir / "config.json").exists()
            has_model = any(local_dir.glob("*.bin")) or any(local_dir.glob("*.safetensors"))
            if has_config or has_model:
                log(f"Model already exists at {local_dir}", "info")
                return True
            else:
                log(f"Directory exists but no model files found at {local_dir}, re-downloading...", "warning")
        
        # Download model
        log(f"Downloading model {repo_id} to {local_dir}...", "info")
        from huggingface_hub import snapshot_download
        
        local_dir.parent.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=repo_id,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False
        )
        log(f"Model downloaded successfully to {local_dir}", "info")
        return True
    except Exception as exc:
        log(f"Failed to download model {repo_id}: {exc}", "error")
        return False


def _ensure_model_loaded() -> bool:
    """Ensure model is loaded with default config if not already loaded."""
    global tts_engine, model_loaded, current_config
    
    if model_loaded and tts_engine is not None:
        return True
    
    try:
        config = _load_config()
        backbones = config.get("backbone_configs", {})
        codecs = config.get("codec_configs", {})
        
        if not backbones or not codecs:
            log("No TTS model configs available", "error")
            return False
        
        # Use first available backbone and codec as defaults
        default_backbone = list(backbones.keys())[0]
        default_codec = list(codecs.keys())[0]
        
        backbone_repo = backbones[default_backbone]["repo"]
        codec_repo = codecs[default_codec]["repo"]
        
        log(f"Auto-loading TTS model: {default_backbone} + {default_codec}", "info")
        
        # Get backbone path (checks multiple locations)
        backbone_path = _get_backbone_path()
        
        if not backbone_path:
            # Download backbone if not found
            if not _ensure_model_downloaded(backbone_repo, VIENEU_BACKBONE_DIR):
                log(f"Failed to download backbone model: {backbone_repo}", "error")
                return False
            backbone_path = str(VIENEU_BACKBONE_DIR)
        
        # Ensure codec is downloaded
        if not _ensure_model_downloaded(codec_repo, VIENEU_CODEC_DIR):
            log(f"Failed to download codec model: {codec_repo}", "error")
            return False
        
        import torch
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        codec_device = "cpu" if "ONNX" in default_codec else device
        
        # Load TTS engine
        tts_engine = _load_tts_engine(backbone_path, codec_repo, device, codec_device)
        
        model_loaded = True
        current_config = {
            "backbone": default_backbone,
            "codec": default_codec,
            "device": device,
            "voice_samples": config.get("voice_samples", {}),
            "max_chars_per_chunk": config.get("text_settings", {}).get("max_chars_per_chunk", 256),
        }
        log("TTS model loaded successfully", "info")
        return True
    except Exception as exc:
        log(f"Failed to auto-load TTS model: {exc}", "error")
        return False


def generate(job_store: JobStore, text: str, mode: str, voice_id: Optional[str], sample_voice_id: Optional[str], sample_text_id: Optional[str]) -> str:
    task_id = f"tts_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Starting generation...")

    def runner() -> None:
        try:
            # Auto-load model if not loaded
            if not model_loaded or tts_engine is None:
                progress_store.set_progress(task_id, "loading", 10, "Loading model...")
                if not _ensure_model_loaded():
                    progress_store.set_progress(task_id, "error", 0, "Failed to load model")
                    return

            from vieneu_utils.core_utils import split_text_into_chunks
            import numpy as np
            import soundfile as sf
            import torch

            voice_samples = current_config.get("voice_samples", {})
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
                ref_codes = tts_engine.encode_reference(ref_audio_path)
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
                ref_codes = tts_engine.encode_reference(str(ref_audio_path))

            if isinstance(ref_codes, torch.Tensor):
                ref_codes = ref_codes.cpu().numpy()

            max_chars = current_config.get("max_chars_per_chunk", 256)
            chunks = split_text_into_chunks(text, max_chars=max_chars)
            total = len(chunks)
            all_segments = []
            sr = 24000
            silence_pad = np.zeros(int(sr * 0.15), dtype=np.float32)

            for idx, chunk in enumerate(chunks):
                percent = 20 + int((idx / max(total, 1)) * 60)
                progress_store.set_progress(task_id, "generating", percent, f"Generating {idx + 1}/{total}")
                wav = tts_engine.infer(chunk, ref_codes=ref_codes, ref_text=ref_text_raw)
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
            progress_store.add_log(task_id, json.dumps({"download_url": f"/api/download/{file_record.file_id}"}))
            
            # Offload model to save memory
            progress_store.add_log(task_id, "Offloading model to save memory...")
            unload_model()
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS generate failed: {exc}", "error")
            # Try to unload model even on error
            try:
                unload_model()
            except:
                pass

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_download_file_id(task_id: str) -> Optional[str]:
    return task_files.get(task_id)
