from __future__ import annotations

import gc
import threading
from pathlib import Path
from typing import Dict, Optional

from python_api.common.jobs import JobStore
from python_api.common.progress import ProgressStore
from python_api.common.paths import MODEL_TRANSLATION_DIR


translation_progress = ProgressStore()

_model = None
_tokenizer = None
_current_device: Optional[str] = None
_model_lock = threading.Lock()

MODEL_ID = "tencent/HY-MT1.5-1.8B-FP8"
MODEL_DIR = MODEL_TRANSLATION_DIR / "HY-MT1.5-1.8B-FP8"

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


def _ensure_model_loaded(task_id: str) -> None:
    """Lazy-load Tencent HY-MT model into module-level cache."""
    global _model, _tokenizer, _current_device

    with _model_lock:
        if _model is not None and _tokenizer is not None:
            return

        translation_progress.set_progress(task_id, "loading_model", 5, "Loading Tencent HY-MT model...")

        from transformers import AutoModelForCausalLM, AutoTokenizer

        MODEL_DIR.mkdir(parents=True, exist_ok=True)

        _tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            cache_dir=str(MODEL_DIR),
            trust_remote_code=True,
        )
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            cache_dir=str(MODEL_DIR),
            device_map="auto",
            trust_remote_code=True,
        )
        _model.eval()
        _current_device = str(next(_model.parameters()).device)
        translation_progress.add_log(task_id, f"Model loaded on {_current_device}")


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

    src_name = LANGUAGE_MAP.get(source_lang, source_lang)
    tgt_name = LANGUAGE_MAP.get(target_lang, target_lang)

    prompt = f"Translate the following {src_name} text to {tgt_name}."
    if preserve_emotion:
        prompt += " Preserve the original tone and emotion."
    if context:
        prompt += f"\n\nContext: {context}"
    prompt += f"\n\nText: {text}\n\nTranslation in {tgt_name}:"

    if hasattr(_tokenizer, "apply_chat_template"):
        messages = [{"role": "user", "content": prompt}]
        inputs = _tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
        )
    else:
        inputs = _tokenizer(prompt, return_tensors="pt").input_ids

    device = next(_model.parameters()).device
    inputs = inputs.to(device)

    pad_token_id = _tokenizer.pad_token_id
    if pad_token_id is None:
        pad_token_id = _tokenizer.eos_token_id

    eos_token_id = _tokenizer.eos_token_id
    if eos_token_id is None:
        eos_token_id = pad_token_id

    import torch

    with torch.no_grad():
        outputs = _model.generate(
            inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.7,
            top_p=0.6,
            top_k=20,
            repetition_penalty=1.05,
            do_sample=True,
            pad_token_id=pad_token_id,
            eos_token_id=eos_token_id,
        )

    prompt_tokens = int(inputs.shape[-1])
    text_tokens = outputs[0][prompt_tokens:]
    decoded = _tokenizer.decode(text_tokens, skip_special_tokens=True).strip()
    return " ".join(decoded.split())


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
            _ensure_model_loaded(job.job_id)

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
