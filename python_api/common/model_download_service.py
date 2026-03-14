from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from python_api.common.paths import (
    MODEL_BIREFNET_DIR,
    MODEL_F5_EN_DIR,
    MODEL_F5_VN_DIR,
    MODEL_PIPER_TTS_DIR,
    MODEL_TRANSLATION_DIR,
    MODEL_WHISPER_DIR,
)
from python_api.common.progress import ProgressStore


@dataclass
class ModelEntry:
    repo_id: str
    local_dir: Path
    display_name: str
    allow_patterns: Optional[list[str]] = field(default=None)
    # Set True only for models whose files live inside subdirectories (e.g. piper-tts)
    check_subdirs: bool = False


MODEL_REGISTRY: dict[str, ModelEntry] = {
    "birefnet": ModelEntry(
        repo_id="psilab/BiRefNet",
        local_dir=MODEL_BIREFNET_DIR,
        display_name="BiRefNet (Background Removal)",
    ),
    "translation": ModelEntry(
        repo_id="psilab/nllb-200-1.3B",
        local_dir=MODEL_TRANSLATION_DIR,
        display_name="NLLB-200 1.3B (Translation)",
    ),
    "piper-tts": ModelEntry(
        repo_id="psilab/piper-tts-finetune",
        local_dir=MODEL_PIPER_TTS_DIR,
        display_name="Piper TTS Finetune",
        check_subdirs=True,
    ),
    "whisper": ModelEntry(
        repo_id="psilab/whisper-large-v3",
        local_dir=MODEL_WHISPER_DIR,
        display_name="Whisper Large V3 (STT)",
        allow_patterns=["large-v3.pt"],
    ),
    "f5-tts-en": ModelEntry(
        repo_id="psilab/f5-tts-en-original",
        local_dir=MODEL_F5_EN_DIR,
        display_name="F5-TTS English",
    ),
    "f5-tts-vn": ModelEntry(
        repo_id="psilab/f5-tts-vn-finetune",
        local_dir=MODEL_F5_VN_DIR,
        display_name="F5-TTS Vietnamese",
    ),
}

_WEIGHT_EXTS = {".bin", ".safetensors", ".pt", ".onnx", ".gguf", ".msgpack"}

# Module-level ProgressStore for downloads triggered via the unified router
download_progress = ProgressStore()


def is_model_downloaded(model_key: str) -> bool:
    """
    Check whether a model's files exist on disk.
    By default only checks top-level files (depth=1) to avoid false positives
    from stale HF cache subdirs or old version subfolders.
    Models with check_subdirs=True use recursive search for their subdir structure.
    """
    entry = MODEL_REGISTRY.get(model_key)
    if not entry or not entry.local_dir.exists():
        return False
    try:
        candidates = entry.local_dir.rglob("*") if entry.check_subdirs else entry.local_dir.iterdir()
        for f in candidates:
            if f.is_file() and (f.suffix in _WEIGHT_EXTS or f.name == "config.json"):
                return True
    except Exception:
        return False
    return False


def download_model(
    model_key: str,
    task_id: str,
    progress_store: ProgressStore,
) -> None:
    """
    Synchronous download worker. Must be called inside a background thread.
    Downloads using snapshot_download with local_dir (Direct model export).
    Reports progress via progress_store.
    """
    from huggingface_hub import snapshot_download

    try:
        from python_api.common.logging import log as _log
    except Exception:
        _log = None

    def log(msg: str, level: str = "info") -> None:
        if _log:
            _log(msg, level, log_name="model-download.log")

    entry = MODEL_REGISTRY.get(model_key)
    if not entry:
        progress_store.set_progress(task_id, "error", 0, f"Unknown model key: {model_key}")
        return

    if is_model_downloaded(model_key):
        progress_store.set_progress(task_id, "complete", 100, "Model already downloaded.")
        return

    try:
        entry.local_dir.mkdir(parents=True, exist_ok=True)
        progress_store.set_progress(
            task_id,
            "downloading",
            5,
            f"Downloading {entry.display_name} from {entry.repo_id}...",
        )
        log(f"Downloading {entry.repo_id} → {entry.local_dir}")

        kwargs: dict = {
            "repo_id": entry.repo_id,
            "local_dir": str(entry.local_dir),
            "local_dir_use_symlinks": False,
        }
        if entry.allow_patterns:
            kwargs["allow_patterns"] = entry.allow_patterns

        snapshot_download(**kwargs)

        progress_store.set_progress(
            task_id,
            "complete",
            100,
            f"{entry.display_name} downloaded successfully.",
        )
        log(f"Model {entry.repo_id} downloaded to {entry.local_dir}")
    except Exception as exc:
        err = str(exc)
        progress_store.set_progress(task_id, "error", 0, err)
        log(f"Model download failed for {model_key}: {err}", "error")


def start_download(model_key: str) -> str:
    """
    Launch download in background thread using the module-level download_progress.
    Returns task_id for SSE streaming via download_progress.sse_stream(task_id).
    """
    task_id = f"model_dl_{uuid.uuid4().hex}"
    download_progress.set_progress(task_id, "starting", 0, "Queuing download...")
    threading.Thread(
        target=download_model,
        args=(model_key, task_id, download_progress),
        daemon=True,
    ).start()
    return task_id


def get_all_model_statuses() -> dict[str, dict]:
    """Return download status for all registered models."""
    return {
        key: {
            "model_key": key,
            "repo_id": entry.repo_id,
            "display_name": entry.display_name,
            "local_dir": str(entry.local_dir),
            "downloaded": is_model_downloaded(key),
        }
        for key, entry in MODEL_REGISTRY.items()
    }
