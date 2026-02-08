from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

from ..logging import log
from ..psi_server_utils import ProgressStore
from ..settings import TEMP_DIR
from .jobs import JobStore


VIENEU_TTS_ROOT = Path(os.environ.get("VIENEU_TTS_ROOT", "")).resolve() if os.environ.get("VIENEU_TTS_ROOT") else None
if VIENEU_TTS_ROOT is None or not VIENEU_TTS_ROOT.exists():
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
            return yaml.safe_load(handle) or {}
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
            from huggingface_hub import snapshot_download

            config = _load_config()
            backbones = config.get("backbone_configs", {})
            codecs = config.get("codec_configs", {})
            if backbone not in backbones or codec not in codecs:
                progress_store.set_progress(task_id, "error", 0, "Invalid backbone or codec")
                return

            progress_store.set_progress(task_id, "downloading", 10, f"Downloading backbone {backbone}...")
            snapshot_download(repo_id=backbones[backbone]["repo"])
            progress_store.set_progress(task_id, "downloading", 55, f"Downloading codec {codec}...")
            snapshot_download(repo_id=codecs[codec]["repo"])
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

            progress_store.set_progress(task_id, "loading", 40, "Initializing TTS engine...")
            import torch
            from vieneu_tts import VieNeuTTS

            if model_loaded and tts_engine is not None:
                del tts_engine
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

            if device == "auto":
                bb_device = "cuda" if torch.cuda.is_available() else "cpu"
                cc_device = "cpu" if "ONNX" in codec else ("cuda" if torch.cuda.is_available() else "cpu")
            else:
                bb_device = device
                cc_device = "cpu" if "ONNX" in codec else device

            tts_engine = VieNeuTTS(
                backbone_repo=backbones[backbone]["repo"],
                backbone_device=bb_device,
                codec_repo=codecs[codec]["repo"],
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
            progress_store.set_progress(task_id, "complete", 100, "Model loaded")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS model load failed: {exc}", "error")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def generate(job_store: JobStore, text: str, mode: str, voice_id: Optional[str], sample_voice_id: Optional[str], sample_text_id: Optional[str]) -> str:
    task_id = f"tts_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, "Starting generation...")

    def runner() -> None:
        try:
            if not model_loaded or tts_engine is None:
                progress_store.set_progress(task_id, "error", 0, "Model not loaded")
                return

            from utils.core_utils import split_text_into_chunks
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
                wav = tts_engine.infer(chunk, ref_codes, ref_text_raw)
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
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"TTS generate failed: {exc}", "error")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_download_file_id(task_id: str) -> Optional[str]:
    return task_files.get(task_id)
