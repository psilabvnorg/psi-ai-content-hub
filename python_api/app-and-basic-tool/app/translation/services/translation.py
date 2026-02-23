from __future__ import annotations

import gc
import threading
import uuid
from typing import Dict, Optional

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.progress import ProgressStore
from python_api.common.paths import MODEL_TRANSLATION_DIR


translation_progress = ProgressStore()

_model = None
_tokenizer = None
_current_device: Optional[str] = None
_model_lock = threading.Lock()

MODEL_ID = "facebook/nllb-200-1.3B"
MODEL_DIR = MODEL_TRANSLATION_DIR / "nllb-200-1.3B"

LANGUAGE_MAP: Dict[str, str] = {
    "vi": "Vietnamese",
    "en": "English",
    "ja": "Japanese",
    "de": "German",
    "zh": "Chinese",
    "ko": "Korean",
    "fr": "French",
    "es": "Spanish",
}

LANGUAGE_CODE_MAP: Dict[str, str] = {
    "vi": "vie_Latn",
    "en": "eng_Latn",
    "ja": "jpn_Jpan",
    "de": "deu_Latn",
    "zh": "zho_Hans",
    "ko": "kor_Hang",
    "fr": "fra_Latn",
    "es": "spa_Latn",
}


def _detect_runtime_device() -> tuple[str, str | None]:
    """Detect runtime compute device, preferring CUDA when available."""
    try:
        import torch

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            return "cuda", gpu_name
    except Exception:
        pass
    return "cpu", None


def _model_downloaded() -> bool:
    """Check if model files are already present in MODEL_DIR."""
    if not MODEL_DIR.exists():
        return False
    has_config = (MODEL_DIR / "config.json").exists()
    weight_extensions = {".bin", ".safetensors", ".pt", ".msgpack", ".ckpt"}
    has_model = any(f.suffix in weight_extensions for f in MODEL_DIR.iterdir() if f.is_file())
    return has_config or has_model


def _download_model_files(task_id: str) -> None:
    """Download model snapshot from Hugging Face Hub to MODEL_DIR."""
    from huggingface_hub import snapshot_download

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    translation_progress.set_progress(task_id, "downloading", 10, f"Downloading {MODEL_ID}...")
    log(f"Downloading translation model {MODEL_ID} to {MODEL_DIR}...", "info", log_name="translation.log")
    snapshot_download(repo_id=MODEL_ID, local_dir=str(MODEL_DIR), local_dir_use_symlinks=False)
    log(f"Translation model downloaded to {MODEL_DIR}", "info", log_name="translation.log")
    translation_progress.set_progress(task_id, "downloaded", 90, "Model files downloaded.")


def _ensure_model_loaded(task_id: str, preferred_device: str) -> None:
    """Lazy-load NLLB-200 model into module-level cache."""
    global _model, _tokenizer, _current_device

    with _model_lock:
        if _model is not None and _tokenizer is not None:
            return

        import torch

        effective_device = preferred_device if preferred_device in {"cuda", "cpu"} else "cpu"
        translation_progress.set_progress(
            task_id,
            "loading_model",
            5,
            f"Loading NLLB-200 model on {effective_device.upper()}...",
        )

        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        model_path = str(MODEL_DIR) if _model_downloaded() else MODEL_ID

        _tokenizer = AutoTokenizer.from_pretrained(
            model_path,
        )
        _model = AutoModelForSeq2SeqLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if effective_device == "cuda" else torch.float32,
            low_cpu_mem_usage=True,
        )
        _model.to(torch.device(effective_device))
        _model.eval()
        _current_device = effective_device
        translation_progress.add_log(task_id, f"Model loaded on {_current_device.upper()}")


def _translate_segment(
    text: str,
    source_lang: str,
    target_lang: str,
    context: str = "",
    preserve_emotion: bool = True,
    max_new_tokens: int = 512,
) -> str:
    """Translate one segment with optional context."""
    global _model, _tokenizer
    if _model is None or _tokenizer is None:
        raise RuntimeError("Translation model is not loaded")

    if source_lang.lower() == target_lang.lower():
        return text.strip()

    _ = preserve_emotion

    src_code = LANGUAGE_CODE_MAP.get(source_lang.lower())
    tgt_code = LANGUAGE_CODE_MAP.get(target_lang.lower())
    if not src_code or not tgt_code:
        raise RuntimeError(f"Unsupported translation language pair: {source_lang} -> {target_lang}")

    if hasattr(_tokenizer, "src_lang"):
        _tokenizer.src_lang = src_code

    text_for_model = text.strip()
    if context.strip():
        text_for_model = f"{context.strip()} {text_for_model}".strip()

    encoded_inputs = _tokenizer(
        text_for_model,
        return_tensors="pt",
        truncation=True,
        max_length=1024,
    )
    device = next(_model.parameters()).device
    inputs = {key: value.to(device) for key, value in encoded_inputs.items()}

    forced_bos_token_id: int | None = None
    language_to_id = getattr(_tokenizer, "lang_code_to_id", None)
    if isinstance(language_to_id, dict):
        raw_id = language_to_id.get(tgt_code)
        if isinstance(raw_id, int):
            forced_bos_token_id = raw_id
    if forced_bos_token_id is None:
        raw_id = _tokenizer.convert_tokens_to_ids(tgt_code)
        if isinstance(raw_id, int):
            forced_bos_token_id = raw_id
    if not isinstance(forced_bos_token_id, int) or forced_bos_token_id < 0:
        raise RuntimeError(f"Failed to resolve NLLB language token for target language: {target_lang}")

    import torch

    with torch.no_grad():
        output_tokens = _model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_new_tokens=max_new_tokens,
            num_beams=4,
        )

    decoded_items = _tokenizer.batch_decode(output_tokens, skip_special_tokens=True)
    decoded = decoded_items[0].strip() if decoded_items else ""
    return " ".join(decoded.split())


def download_model(job_store: JobStore) -> str:
    """Download and cache the NLLB-200 model to MODEL_DIR, streaming progress via SSE."""
    task_id = f"translation_model_{uuid.uuid4().hex}"
    translation_progress.set_progress(task_id, "starting", 0, "Starting model download...")

    def runner() -> None:
        try:
            if _model_downloaded():
                translation_progress.set_progress(task_id, "complete", 100, "Model already downloaded.")
                log(f"Translation model already present at {MODEL_DIR}", "info", log_name="translation.log")
                return
            _download_model_files(task_id)
            translation_progress.set_progress(task_id, "complete", 100, "Model downloaded successfully.")
        except Exception as exc:
            translation_progress.set_progress(task_id, "error", 0, str(exc))
            log(f"Translation model download failed: {exc}", "error", log_name="translation.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def start_translation(
    job_store: JobStore,
    text: str,
    source_lang: str,
    target_lang: str,
    segments: Optional[list[dict]] = None,
    preserve_emotion: bool = True,
) -> str:
    """Start translation task in background thread and return job id."""
    job = job_store.create_job()

    def runner() -> None:
        try:
            translation_progress.set_progress(job.job_id, "starting", 0, "Starting translation...")
            preferred_device, gpu_name = _detect_runtime_device()
            if preferred_device == "cuda":
                translation_progress.add_log(job.job_id, f"CUDA detected. Using GPU: {gpu_name or 'NVIDIA GPU'}")
            else:
                translation_progress.add_log(job.job_id, "CUDA not detected. Falling back to CPU.")

            _ensure_model_loaded(job.job_id, preferred_device=preferred_device)

            if segments:
                normalized_segments = [seg for seg in segments if isinstance(seg, dict) and str(seg.get("text", "")).strip()]
                if not normalized_segments:
                    raise RuntimeError("segments contains no translatable text")

                translated_segments: list[dict] = []
                total = len(normalized_segments)

                for idx, segment in enumerate(normalized_segments):
                    percent = 10 + int((idx / max(total, 1)) * 85)
                    translation_progress.set_progress(
                        job.job_id,
                        "translating",
                        percent,
                        f"Translating segment {idx + 1}/{total}...",
                    )

                    context_parts: list[str] = []
                    if idx > 0:
                        prev_text = str(normalized_segments[idx - 1].get("text", "")).strip()
                        if prev_text:
                            context_parts.append(prev_text)
                    if idx < total - 1:
                        next_text = str(normalized_segments[idx + 1].get("text", "")).strip()
                        if next_text:
                            context_parts.append(next_text)
                    context = " ".join(context_parts)

                    original_text = str(segment.get("text", "")).strip()
                    translated_text = _translate_segment(
                        original_text,
                        source_lang=source_lang,
                        target_lang=target_lang,
                        context=context,
                        preserve_emotion=preserve_emotion,
                    )
                    translated_segments.append(
                        {
                            "text": translated_text,
                            "start": segment.get("start", segment.get("start_time")),
                            "end": segment.get("end", segment.get("end_time")),
                            "original_text": original_text,
                        }
                    )

                translated_text = " ".join(seg["text"] for seg in translated_segments).strip()
                result = {
                    "translated_text": translated_text,
                    "source_language": source_lang,
                    "target_language": target_lang,
                    "segments": translated_segments,
                    "segments_count": len(translated_segments),
                }
            else:
                clean_text = text.strip()
                if not clean_text:
                    raise RuntimeError("text is required when segments is not provided")
                translation_progress.set_progress(job.job_id, "translating", 30, "Translating text...")
                translated_text = _translate_segment(
                    clean_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    preserve_emotion=preserve_emotion,
                )
                result = {
                    "translated_text": translated_text,
                    "source_language": source_lang,
                    "target_language": target_lang,
                }

            job_store.update_job(job.job_id, "complete", result=result)
            translation_progress.set_progress(job.job_id, "complete", 100, "Translation complete")
        except Exception as exc:
            job_store.update_job(job.job_id, "error", error=str(exc))
            translation_progress.set_progress(job.job_id, "error", 0, str(exc))

    threading.Thread(target=runner, daemon=True).start()
    return job.job_id


def get_translation_status(job_store: JobStore, job_id: str) -> Optional[dict]:
    """Return translation task status payload."""
    record = job_store.get_job(job_id)
    if not record:
        return None
    return {
        "job_id": record.job_id,
        "status": record.status,
        "result": record.result,
        "error": record.error,
    }


def get_model_status() -> dict:
    """Return current translation model state."""
    return {
        "loaded": _model is not None and _tokenizer is not None,
        "downloaded": _model_downloaded(),
        "model_id": MODEL_ID,
        "model_dir": str(MODEL_DIR),
        "device": _current_device,
        "supported_languages": LANGUAGE_MAP,
    }


def unload_model() -> dict:
    """Unload model and clear CUDA cache when available."""
    global _model, _tokenizer, _current_device

    with _model_lock:
        if _model is None and _tokenizer is None:
            return {"status": "not_loaded"}

        _model = None
        _tokenizer = None
        _current_device = None
        gc.collect()

        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

        return {"status": "unloaded"}
