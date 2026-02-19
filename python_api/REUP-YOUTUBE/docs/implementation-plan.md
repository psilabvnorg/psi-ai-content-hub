# REUP-YOUTUBE Pipeline Migration Plan

## Overview

Migrate 8 of 9 pipeline stages from in-process library calls / subprocesses to calling existing REST APIs within the `python_api/` ecosystem. This eliminates duplicate yt-dlp/ffmpeg/Whisper/TTS code and centralizes these capabilities in shared microservices. Stages 4, 6, and 7 (Visual Assets, Subtitles, Scene Assembly) are consolidated into the Remotion rendering pipeline, which handles image slideshow, word-level caption display, and scene composition natively. Stage 3 (Translation) is migrated to a new API tool in `app-and-basic-tool` using the Tencent HY-MT model.

### Stages Being Migrated

| Stage | Current Implementation | Target API | Port |
|-------|----------------------|------------|------|
| 1. Video Ingestion | yt-dlp + ffmpeg subprocess | `app-and-basic-tool` `/api/v1/video/download` + `/video/extract-audio` | 6900 |
| 2. Transcription | In-process Whisper/PhoWhisper | `whisper-stt` `/api/v1/transcribe` | 6904 |
| 3. Translation | In-process Tencent HY-MT model | `app-and-basic-tool` `/api/v1/translation/translate` (NEW) | 6900 |
| 4. Visual Assets | Bing image search + scene mapping | Simplified: images passed directly to Remotion render API | 6900 |
| 5. TTS Synthesis | In-process Edge TTS | `VieNeu-TTS` `/api/v1/generate` | 6903 |
| 6. Subtitle Generation | In-process Whisper word-level alignment | Eliminated: Remotion `CaptionDisplay` uses Whisper JSON natively | 6900 |
| 7. Scene Assembly | Custom SceneAssembler logic | Eliminated: Remotion `LoopingImageSlider` auto-cycles images | 6900 |
| 8. Video Rendering | MoviePy + FFmpeg subprocess | `app-and-basic-tool` `/api/v1/text-to-video/render` (Remotion) | 6900 |

### Stages NOT Being Migrated (remain as-is)

| Stage | Reason |
|-------|--------|
| 9. Export | Custom ffmpeg optimization, no API equivalent |
| 10. Validation | Custom quality checks, no API equivalent |

---

## Prerequisites

All target API services must be running before the pipeline executes:

- **app-and-basic-tool** on `http://127.0.0.1:6900` (video download, extract-audio, translation, Remotion rendering)
- **whisper-stt** on `http://127.0.0.1:6904` (transcription with word-level timestamps)
- **VieNeu-TTS** on `http://127.0.0.1:6903` (text-to-speech, model must be loaded)

The translation API tool in `app-and-basic-tool` requires:
- `transformers` and `torch` packages (add to `python_api/app-and-basic-tool/requirements.txt`)
- Tencent HY-MT1.5-1.8B-FP8 model (auto-downloaded on first use or pre-downloaded to model cache)
- GPU recommended for inference speed (falls back to CPU with `device_map="auto"`)

Add `requests>=2.31.0` to requirements (already present).

---

## Step 1: Create API Client Module

**File**: `src/multilingual_video_pipeline/services/api_client.py` (NEW)

Create a shared HTTP client wrapper with:
- Configurable base URLs for each service (default to localhost ports)
- `poll_for_completion(base_url, task_id, stream_path, result_path)` — generic helper that:
  1. Consumes SSE stream at `{base_url}{stream_path}/{task_id}` parsing `data:` lines for progress JSON
  2. Calls `ProgressCallback.on_stage_progress()` with percent/message from SSE events
  3. Returns final result from `{base_url}{result_path}/{task_id}` when status is `complete`
  4. Raises on `error`/`failed` status
- `download_file(base_url, file_id, output_path)` — downloads binary from `/api/v1/files/{file_id}` and writes to disk
- Timeout and retry configuration
- Logging via existing `LoggerMixin`

**Settings additions in `config.py`**:


---

## Step 2: Migrate Stage 1 — Video Ingestion

**File to modify**: `src/multilingual_video_pipeline/services/video_ingestion.py`

### Current flow (in `_stage_video_ingestion` of pipeline.py):
1. `VideoIngestionService.download_video(video_id)` → runs yt-dlp subprocess → returns local file path
2. `VideoIngestionService.extract_metadata(video_id)` → runs yt-dlp `--dump-json` → returns `VideoMetadata`
3. `VideoIngestionService.extract_audio(video_path)` → runs ffmpeg subprocess → returns audio path

### Migrated flow:

**2a. Download video**:
- `POST http://127.0.0.1:6900/api/v1/video/download`
- Body: `{ "url": job.video_url, "platform": "youtube", "convert_to_h264": true }`
- Response: `{ "job_id": "..." }`
- Poll SSE at `GET /api/v1/video/download/stream/{job_id}` until complete
- Get status from `GET /api/v1/video/download/status/{job_id}` → result has `download_url`
- Download MP4 via `GET /api/v1/files/{file_id}` to local `stage_dir/video.mp4`

**2b. Extract metadata**:
- Keep current `yt-dlp --dump-json --no-download` approach (no API equivalent for metadata-only extraction)
- OR parse metadata from the download result (limited fields available)

**2c. Extract audio**:
- Upload downloaded video to `POST http://127.0.0.1:6900/api/v1/video/extract-audio`
- Form: `file=@video.mp4, format=wav`
- Response: `{ "download_url": "/api/v1/files/{file_id}" }`
- Download WAV to `stage_dir/audio.wav`

### Interface change:
- Add `use_api: bool = True` parameter to `VideoIngestionService.__init__()` to allow fallback to subprocess mode
- Internal methods become: `_download_via_api()` / `_download_via_subprocess()`

### Data contract (unchanged):
```python
intermediate_results['video_ingestion'] = {
    'video_path': str,      # local path to downloaded MP4
    'audio_path': str,      # local path to extracted WAV
    'metadata_path': str,   # local path to metadata JSON
    'metadata': dict,       # { title, duration, description }
    'video_id': str,
    'stage_dir': str,
}
```

---

## Step 3: Migrate Stage 2 — Transcription

**File to modify**: `src/multilingual_video_pipeline/services/transcription.py`

### Current flow (in `_stage_transcription` of pipeline.py):
1. `TranscriptionService.transcribe_audio(audio_path, language, restore_punctuation=True)` → loads Whisper/PhoWhisper in-process → returns `Transcript` object

### Migrated flow:

**3a. Upload audio and start transcription**:
- `POST http://127.0.0.1:6904/api/v1/transcribe`
- Multipart form: `file=@audio.wav, model=large-v3, language={detected_lang}, add_punctuation=true, word_timestamps=true`
- Response: `{ "task_id": "stt_..." }`

**3b. Poll for completion**:
- SSE at `GET /api/v1/transcribe/stream/{task_id}` for progress updates
- Result at `GET /api/v1/transcribe/result/{task_id}` returns:

```json
{
    "text": "full transcription",
    "text_with_punctuation": "...",
    "language": "vi",
    "duration": 123.45,
    "segments_count": 12,
    "segments": [
        { "id": 0, "start": 0.0, "end": 2.5, "text": "...", "words": [...] }
    ]
}
```

**3c. Convert API response to pipeline models**:
- Map each segment to `TranscriptSegment(text, start_time, end_time, confidence=0.95, words=segment.get('words'))`
- Create `Transcript(segments, language, full_text, transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL, model_confidence=0.95)`

### Key considerations:
- The whisper-stt API uses OpenAI Whisper only (no PhoWhisper). For Vietnamese, set `language="vi"` and use `model=large-v3` for best accuracy
- Word-level timestamps are available via `word_timestamps=true` — critical for subtitle generation (stage 6)
- The API response `segments` format closely matches pipeline's `TranscriptSegment` — map `start` → `start_time`, `end` → `end_time`

### Data contract (unchanged):

```python
intermediate_results['transcription'] = {
    'transcript_path': str,
    'language': str,
    'segments': int,
    'duration': float,
    'confidence': float,
    'stage_dir': str,
}
```

---

## Step 4: Create Translation API Tool in app-and-basic-tool (NEW)

This step creates a brand-new translation API tool inside `python_api/app-and-basic-tool` that wraps the Tencent HY-MT1.5-1.8B-FP8 model as a shared REST service. This centralizes the translation capability so any project (REUP-YOUTUBE, or future pipelines) can use it without bundling the model themselves.

### 4a. Create Translation Service

**File**: `python_api/app-and-basic-tool/app/services/translation.py` (NEW)

Follows the existing async job pattern (same as `video.py`): spawn a daemon thread, track progress via `ProgressStore`, store results in `JobStore`.

```python
import threading
import hashlib
import json
import time
from pathlib import Path
from typing import Optional, Dict, List

from python_api.common.jobs import JobStore
from python_api.common.progress import ProgressStore
from python_api.common.paths import MODEL_ROOT

translation_progress = ProgressStore()

# Module-level model cache (lazy-loaded, persists across requests)
_model = None
_tokenizer = None
_model_lock = threading.Lock()
_current_device = None

MODEL_ID = "tencent/HY-MT1.5-1.8B-FP8"
MODEL_DIR = MODEL_ROOT / "translation" / "HY-MT1.5-1.8B-FP8"

LANGUAGE_MAP = {
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
    """Lazy-load the HY-MT model (thread-safe, cached across requests)."""
    global _model, _tokenizer, _current_device
    with _model_lock:
        if _model is not None:
            return
        translation_progress.set_progress(task_id, "loading_model", 5, "Loading Tencent HY-MT model...")
        from transformers import AutoTokenizer, AutoModelForCausalLM
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
        _current_device = next(_model.parameters()).device
        translation_progress.add_log(task_id, f"Model loaded on {_current_device}")


def _translate_segment(
    text: str,
    source_lang: str,
    target_lang: str,
    context: str = "",
    preserve_emotion: bool = True,
    max_new_tokens: int = 512,
) -> str:
    """Translate a single text segment using the loaded HY-MT model."""
    src_name = LANGUAGE_MAP.get(source_lang, source_lang)
    tgt_name = LANGUAGE_MAP.get(target_lang, target_lang)

    system_msg = f"You are a professional translator from {src_name} to {tgt_name}."
    user_msg = f"Translate the following {src_name} text to {tgt_name}."
    if preserve_emotion:
        user_msg += " Preserve the original tone and emotion."
    if context:
        user_msg += f"\n\nContext: {context}"
    user_msg += f"\n\nText: {text}\n\nTranslation:"

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]
    tokenized = _tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, return_tensors="pt"
    ).to(_current_device)

    outputs = _model.generate(
        tokenized,
        max_new_tokens=max_new_tokens,
        temperature=0.7,
        top_p=0.6,
        top_k=20,
        repetition_penalty=1.05,
        do_sample=True,
        pad_token_id=_tokenizer.pad_token_id,
        eos_token_id=_tokenizer.eos_token_id,
    )
    decoded = _tokenizer.decode(outputs[0][tokenized.shape[-1]:], skip_special_tokens=True)
    return decoded.strip()


def start_translation(
    job_store: JobStore,
    text: str,
    source_lang: str,
    target_lang: str,
    segments: Optional[List[dict]] = None,
    preserve_emotion: bool = True,
) -> str:
    """Start an async translation job. Returns job_id immediately."""
    job = job_store.create_job()

    def runner() -> None:
        try:
            translation_progress.set_progress(job.job_id, "starting", 0, "Starting translation...")
            _ensure_model_loaded(job.job_id)

            if segments:
                # Batch mode: translate each segment individually (preserves timing alignment)
                translated_segments = []
                total = len(segments)
                for i, seg in enumerate(segments):
                    pct = 10 + int((i / total) * 85)
                    translation_progress.set_progress(
                        job.job_id, "translating", pct,
                        f"Translating segment {i+1}/{total}..."
                    )
                    # Use adjacent segments as context
                    ctx_parts = []
                    if i > 0:
                        ctx_parts.append(segments[i - 1].get("text", ""))
                    if i < total - 1:
                        ctx_parts.append(segments[i + 1].get("text", ""))
                    context = " ".join(ctx_parts)

                    translated_text = _translate_segment(
                        seg["text"], source_lang, target_lang,
                        context=context, preserve_emotion=preserve_emotion,
                    )
                    translated_segments.append({
                        "text": translated_text,
                        "start": seg.get("start", seg.get("start_time")),
                        "end": seg.get("end", seg.get("end_time")),
                        "original_text": seg["text"],
                    })

                full_translated = " ".join(s["text"] for s in translated_segments)
                result = {
                    "translated_text": full_translated,
                    "source_language": source_lang,
                    "target_language": target_lang,
                    "segments": translated_segments,
                    "segments_count": len(translated_segments),
                }
            else:
                # Simple mode: translate full text as one block
                translation_progress.set_progress(
                    job.job_id, "translating", 30, "Translating text..."
                )
                translated_text = _translate_segment(
                    text, source_lang, target_lang,
                    preserve_emotion=preserve_emotion,
                )
                result = {
                    "translated_text": translated_text,
                    "source_language": source_lang,
                    "target_language": target_lang,
                }

            translation_progress.set_progress(job.job_id, "complete", 100, "Translation complete")
            job_store.update_job(job.job_id, "complete", result=result)

        except Exception as exc:
            job_store.update_job(job.job_id, "error", error=str(exc))
            translation_progress.set_progress(job.job_id, "error", 0, str(exc))

    threading.Thread(target=runner, daemon=True).start()
    return job.job_id


def get_model_status() -> dict:
    """Return current model load status."""
    return {
        "loaded": _model is not None,
        "model_id": MODEL_ID,
        "model_dir": str(MODEL_DIR),
        "device": str(_current_device) if _current_device else None,
        "supported_languages": LANGUAGE_MAP,
    }


def unload_model() -> dict:
    """Unload model to free GPU memory."""
    global _model, _tokenizer, _current_device
    with _model_lock:
        if _model is not None:
            del _model
            del _tokenizer
            _model = None
            _tokenizer = None
            _current_device = None
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return {"status": "unloaded"}
        return {"status": "not_loaded"}
```

### 4b. Create Translation Router

**File**: `python_api/app-and-basic-tool/app/routers/translation.py` (NEW)

```python
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from python_api.common.jobs import JobStore
from ..deps import get_job_store
from ..services.translation import (
    translation_progress, start_translation, get_model_status, unload_model,
)

router = APIRouter(prefix="/api/v1/translation", tags=["translation"])


@router.post("/translate")
def translate(
    payload: dict = Body(...),
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    """Start a translation job.

    Body (simple mode):
        { "text": "...", "source_lang": "vi", "target_lang": "en" }

    Body (segment mode — preserves timing for pipeline use):
        {
            "source_lang": "vi",
            "target_lang": "en",
            "preserve_emotion": true,
            "segments": [
                { "text": "...", "start": 0.0, "end": 5.2 },
                { "text": "...", "start": 5.2, "end": 10.0 }
            ]
        }
    """
    text = payload.get("text", "").strip()
    segments = payload.get("segments")
    source_lang = payload.get("source_lang", "")
    target_lang = payload.get("target_lang", "")

    if not source_lang or not target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang are required")
    if not text and not segments:
        raise HTTPException(status_code=400, detail="Either text or segments is required")

    preserve_emotion = payload.get("preserve_emotion", True)
    job_id = start_translation(
        job_store, text, source_lang, target_lang,
        segments=segments, preserve_emotion=preserve_emotion,
    )
    return {"job_id": job_id}


@router.get("/translate/stream/{job_id}")
def translate_stream(job_id: str) -> StreamingResponse:
    """SSE stream for translation progress."""
    return StreamingResponse(
        translation_progress.sse_stream(job_id),
        media_type="text/event-stream",
    )


@router.get("/translate/result/{job_id}")
def translate_result(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
) -> dict:
    """Get translation result."""
    record = job_store.get_job(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")
    progress = translation_progress.get_payload(job_id, include_logs=False)
    return {
        "job_id": job_id,
        "status": record.status,
        "result": record.result,
        "error": record.error,
        "progress": progress,
    }


@router.get("/status")
def model_status() -> dict:
    """Check translation model status."""
    return get_model_status()


@router.post("/unload")
def model_unload() -> dict:
    """Unload translation model to free GPU memory."""
    return unload_model()
```

### 4c. Register Router in app.py

**File to modify**: `python_api/app-and-basic-tool/app/app.py`

Add to `create_app()`:
```python
from .routers import translation as translation_router
app.include_router(translation_router.router)
```

### 4d. Add Model Path

**File to modify**: `python_api/common/paths.py`

Add:
```python
MODEL_TRANSLATION_DIR = MODEL_ROOT / "translation"
```

### 4e. Update Dependencies

**File to modify**: `python_api/app-and-basic-tool/requirements.txt`

Add (if not already present):
```
transformers>=4.40.0
torch>=2.0.0
accelerate>=0.27.0
```

### API Endpoints Summary

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/translation/translate` | Start translation job (simple text or segments) |
| GET | `/api/v1/translation/translate/stream/{job_id}` | SSE progress stream |
| GET | `/api/v1/translation/translate/result/{job_id}` | Get translation result |
| GET | `/api/v1/translation/status` | Check model load status |
| POST | `/api/v1/translation/unload` | Unload model to free GPU memory |

### Request/Response Formats

**Simple text translation:**
```json
// POST /api/v1/translation/translate
{
    "text": "Xin chào thế giới",
    "source_lang": "vi",
    "target_lang": "en",
    "preserve_emotion": true
}
// Response: { "job_id": "job_abc123" }
```

**Segment-based translation (for pipeline use):**
```json
// POST /api/v1/translation/translate
{
    "source_lang": "vi",
    "target_lang": "en",
    "preserve_emotion": true,
    "segments": [
        { "text": "Segment đầu tiên.", "start": 0.0, "end": 5.2 },
        { "text": "Segment thứ hai.", "start": 5.2, "end": 10.0 }
    ]
}
```

**Result (segment mode):**
```json
// GET /api/v1/translation/translate/result/{job_id}
{
    "job_id": "job_abc123",
    "status": "complete",
    "result": {
        "translated_text": "First segment. Second segment.",
        "source_language": "vi",
        "target_language": "en",
        "segments": [
            { "text": "First segment.", "start": 0.0, "end": 5.2, "original_text": "Segment đầu tiên." },
            { "text": "Second segment.", "start": 5.2, "end": 10.0, "original_text": "Segment thứ hai." }
        ],
        "segments_count": 2
    },
    "error": null,
    "progress": { "status": "complete", "percent": 100, "message": "Translation complete" }
}
```

**SSE stream events:**
```
data: {"status": "starting", "percent": 0, "message": "Starting translation..."}
data: {"status": "loading_model", "percent": 5, "message": "Loading Tencent HY-MT model..."}
data: {"status": "translating", "percent": 30, "message": "Translating segment 1/12..."}
data: {"status": "translating", "percent": 80, "message": "Translating segment 10/12..."}
data: {"status": "complete", "percent": 100, "message": "Translation complete"}
```

### Key Design Decisions

- **Model caching**: The HY-MT model is loaded once on first request and cached in module-level globals. Subsequent requests reuse the loaded model (no reload overhead). An explicit `/unload` endpoint frees GPU memory when needed.
- **Segment mode**: The segment-based API preserves timestamp alignment from the transcription stage, which is critical for the REUP-YOUTUBE pipeline. Each segment is translated individually with adjacent-segment context for coherence.
- **Context window**: Adjacent segments are passed as context to improve translation coherence across segment boundaries.
- **Same generation parameters**: Uses the same inference parameters as the current in-process implementation (`temperature=0.7`, `top_p=0.6`, `top_k=20`, `repetition_penalty=1.05`).
- **Thread safety**: Model loading is protected by `_model_lock`. The `ProgressStore` and `JobStore` are already thread-safe.

---

## Step 5: Migrate Stage 3 — Translation (Pipeline Side)

**File to modify**: `src/multilingual_video_pipeline/services/translation.py`

### Current flow (in `_stage_translation` of pipeline.py):
1. `TranslationService._load_model()` → loads Tencent HY-MT1.5-1.8B-FP8 via HuggingFace transformers in-process
2. For each target language: `TranslationService.translate_script(transcript, target_lang)` → translates segment-by-segment → returns `TranslatedScript`
3. Saves translation JSON to output directory

### Migrated flow:

**5a. Upload transcript segments and start translation**:
- `POST http://127.0.0.1:6900/api/v1/translation/translate`
- Body:
```json
{
    "source_lang": "{transcript.language}",
    "target_lang": "{target_lang}",
    "preserve_emotion": true,
    "segments": [
        { "text": "segment text", "start": 0.0, "end": 5.2 },
        ...
    ]
}
```
- Response: `{ "job_id": "..." }`

**5b. Poll for completion**:
- SSE at `GET /api/v1/translation/translate/stream/{job_id}` for progress updates
- Result at `GET /api/v1/translation/translate/result/{job_id}`

**5c. Convert API response to pipeline models**:
- Map each translated segment to `TranscriptSegment(text=seg["text"], start_time=seg["start"], end_time=seg["end"])`
- Create `TranslatedScript(original=transcript, translated_segments=segments, target_language=target_lang)`
- Calculate `duration_ratio` from segment timing alignment

### Key considerations:
- The API loads the model on first request — first translation may take 30-60s for model loading. Subsequent translations are fast.
- For multi-language jobs, translations are sequential (one language at a time) to avoid GPU memory contention
- The API preserves the same generation parameters as the current in-process implementation, so translation quality should be identical
- `TranslationQuality` assessment remains in-process (no API equivalent needed — it's just arithmetic on the results)
- Caching (MD5 hash of text + language pair) can remain in the pipeline client or be added to the API later

### Data contract (unchanged):

```python
intermediate_results['translation'] = {
    lang: {
        'language': str,
        'translation_path': str,
        'output_translation_path': str,
        'segments': int,
        'duration_ratio': float,
    }
}
```

---

## Step 6: Migrate Stage 5 — TTS Synthesis

**File to modify**: Replace `edge_tts_service.py` usage with VieNeu-TTS API calls.

### Current flow (in `_stage_tts_synthesis` of pipeline.py):
1. For each target language: `EdgeTTSService.synthesize_speech(translated_script, output_dir, emotion)` → uses `edge_tts.Communicate` async library → returns audio Path
2. Probes duration with ffprobe

### Migrated flow:

**4a. Ensure VieNeu-TTS model is loaded**:
- Check model status first; if not loaded, call:
- `POST http://127.0.0.1:6903/api/v1/models/load` with `{ "backbone": "gpu-full", "codec": "neucodec-standard" }`
- Wait for SSE stream completion

**4b. For each target language, for each translated segment**:
- Since VieNeu-TTS generates one audio file per request, concatenate all translated segment texts into a single request (respecting 3000 char limit for streaming, or chunk if needed)
- `POST http://127.0.0.1:6903/api/v1/generate`
- Body: `{ "text": full_translated_text, "mode": "preset", "voice_id": "{language_voice_id}" }`
- Response: `{ "task_id": "..." }`

**4c. Poll and download**:
- SSE at `GET /api/v1/generate/stream/{task_id}`
- Download from `GET /api/v1/generate/download/{task_id}` → `{ "download_url": "/api/v1/files/{file_id}" }`
- Download WAV from `GET http://127.0.0.1:6903/api/v1/files/{file_id}` to `stage_dir/{lang}_narration.wav`

### Key considerations:
- VieNeu-TTS outputs WAV at **24000 Hz** — pipeline expects **48000 Hz** (`settings.audio_sample_rate`). Add a post-processing step using ffmpeg to resample: `ffmpeg -i input.wav -ar 48000 output.wav`
- VieNeu-TTS is Vietnamese-optimized. For non-Vietnamese languages (EN, JA, DE), verify voice quality. May need to keep Edge TTS as fallback for non-Vietnamese languages, or add those voices to VieNeu-TTS
- Voice ID mapping needs to be established by querying `GET /api/v1/voices` and matching per-language
- Maximum text per request: chunks of 256 chars internally, but max 3000 chars streaming limit. For long translations, split into multiple API calls and concatenate output audio files
- Audio loudness normalization (-16 LUFS) — currently done in-process by Edge TTS service. VieNeu-TTS does not normalize. Keep the existing `pyloudnorm` normalization step post-download

### Data contract (unchanged):

```python
intermediate_results['tts_synthesis'] = {
    lang: { 'audio_path': str, 'duration': float, 'size_mb': float }
}
```

---

## Step 7: Consolidate Stages 4, 6, 7 — Remotion Content Preparation

Stages 4 (Visual Assets), 6 (Subtitle Generation), and 7 (Scene Assembly) are consolidated into a single Remotion content preparation step. Remotion's architecture natively handles image slideshows, word-level caption display, and scene composition — replacing three custom pipeline stages with configuration-driven rendering.

### How Remotion replaces these stages

Remotions content folder structure (from the `remotion/news` project):

```
public/main/video_X/
  audio/
    narration.wav          # TTS narration audio
    narration.json         # Caption JSON (Whisper format — word-level timestamps)
  image/
    Intro.jpg              # Intro background image
    01.jpg, 02.jpg, ...    # Slideshow images (sorted alphabetically)
  config/
    video-config.json      # Timing and layout mode
    intro-config.json      # Intro overlay appearance
```

| Pipeline Stage | Remotion Equivalent | What Changes |
|---|---|---|
| **Stage 4: Visual Assets** | `LoopingImageSlider` auto-cycles images from `image/` folder | Keep image download (Bing search via LLM `/api/v1/llm/generate` keywords). Remove `match_images_to_scenes()` — no scene mapping needed. Just collect and rename images to `01.jpg`, `02.jpg`, etc. |
| **Stage 6: Subtitles** | `CaptionDisplay` renders TikTok-style word-highlighted captions | **Eliminated entirely.** Remotion accepts Whisper JSON directly via `normalizeCaptions.ts`. The transcript from Stage 2 is saved alongside the audio file as the caption source. No SRT generation needed. |
| **Stage 7: Scene Assembly** | `calculateMainVideoMetadata` + `LoopingImageSlider` | **Eliminated entirely.** Remotion auto-composes: loads images (sorted), loads audio, calculates total duration from audio length, cycles images using `imageDurationInFrames`. Built-in pan animation replaces Ken Burns effect. |

### 7a. Simplify Visual Asset Collection

**File to modify**: `src/multilingual_video_pipeline/services/visual_asset_manager.py`

Keep the image search and download pipeline:
1. `semantic_search_and_download(text, limit=10)` → LLM API (`POST http://127.0.0.1:6900/api/v1/llm/generate` with `{ "prompt": "Extract 15 visual keywords...", "input_text": transcript_text, "model": "deepseek-r1:8b" }`) summarizes transcript into keywords → Bing image download
2. **Remove** `match_images_to_scenes()` — Remotion handles image-to-timeline mapping
3. **Add** `prepare_for_remotion(assets, output_dir)` — renames downloaded images to `01.jpg`, `02.jpg`, ... (sorted by relevance score)
4. Select one image as `Intro.jpg` (first/best image, or video thumbnail from metadata)

```python
def prepare_for_remotion(self, assets: List[VisualAsset], output_dir: Path) -> dict:
    """Rename and copy assets for Remotion content folder."""
    image_dir = output_dir / "image"
    image_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy intro image
    intro_asset = assets[0]  # Best/first image as intro
    shutil.copy2(intro_asset.path, image_dir / "Intro.jpg")
    
    # Copy content images with ordered names
    image_paths = []
    for i, asset in enumerate(assets[:10]):  # Remotion max 10 images
        dest = image_dir / f"{i+1:02d}.jpg"
        shutil.copy2(asset.path, dest)
        image_paths.append(dest)
    
    return {
        "intro_image": image_dir / "Intro.jpg",
        "content_images": image_paths,
        "total_images": len(image_paths),
    }
```

### 7b. Prepare Caption JSON (replaces Stage 6)

The Whisper JSON from Stage 2 (transcription) is already in a format Remotion accepts. Remotion's `normalizeCaptions.ts` handles:
- Whisper word format: `{ word, start, end, probability }`
- Whisper segment format: `{ text, start, end, words: [...] }`
- Full Whisper output: `{ segments: [{ text, start, end, words: [...] }] }`

**For translated languages** (from Stage 3), generate a new caption JSON by mapping translated text to the original segment timings:

```python
def prepare_caption_json(transcript_path: Path, translation_path: Path | None, output_dir: Path) -> Path:
    """Create Remotion-compatible caption JSON."""
    audio_dir = output_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    
    if translation_path:
        # For translated content: map translated text to original segment timings
        with open(transcript_path) as f:
            transcript = json.load(f)
        with open(translation_path) as f:
            translation = json.load(f)
        
        # Create segments with translated text but original timestamps
        caption_data = {
            "segments": [
                {
                    "text": trans_seg["text"],
                    "start": orig_seg["start"],
                    "end": orig_seg["end"],
                }
                for orig_seg, trans_seg in zip(transcript["segments"], translation["segments"])
            ]
        }
    else:
        # For original language: use Whisper JSON directly (has word-level timestamps)
        with open(transcript_path) as f:
            caption_data = json.load(f)
    
    caption_path = audio_dir / "narration.json"
    with open(caption_path, "w", encoding="utf-8") as f:
        json.dump(caption_data, f, ensure_ascii=False, indent=2)
    
    return caption_path
```

### 7c. Generate Remotion Config Files (replaces Stage 7)

**video-config.json**:
```json
{
    "backgroundMode": false,
    "introDurationInFrames": 150,
    "imageDurationInFrames": 170
}
```

- `backgroundMode: false` — intro plays then disappears; images play after
- `introDurationInFrames: 150` — 5 seconds at 30fps
- `imageDurationInFrames: 170` — ~5.7 seconds per image; auto-cycles through all images over audio duration

**intro-config.json** (mapped from `VideoMetadata`):
```json
{
    "templateId": "template_1",
    "title": "{metadata.title}",
    "brandName": "{metadata.channel_name}",
    "tagline": "{target_language} version",
    "url": "{metadata.url}",
    "backgroundImage": "main/{content_dir}/image/Intro.jpg"
}
```

### 7d. Eliminated code

- **Remove** `SubtitleGenerator` class and `_stage_subtitle_generation()` pipeline method
- **Remove** `SceneAssembler` class and `_stage_scene_assembly()` pipeline method
- **Remove** `match_images_to_scenes()` and transition/Ken Burns logic from `VisualAssetManager`
- **Simplify** `_stage_visual_assets()` to only download and rename images

### Data contracts:

```python
# Stage 4 output (simplified)
intermediate_results['visual_assets'] = {
    'total_assets': int,
    'assets_dir': str,
    'intro_image': str,        # path to Intro.jpg
    'content_images': [str],   # paths to 01.jpg, 02.jpg, ...
}

# Stages 6 & 7 outputs — no longer produced
# intermediate_results['subtitle_generation'] — REMOVED
# intermediate_results['scene_assembly'] — REMOVED

# New: Remotion content preparation output
intermediate_results['remotion_content'] = {
    'content_dir': str,        # path to prepared Remotion content folder
    'caption_path': str,       # path to narration.json
    'video_config_path': str,  # path to video-config.json
    'intro_config_path': str,  # path to intro-config.json
}
```

---

## Step 8: Migrate Stage 8 — Video Rendering to Remotion

**File to modify**: `video_renderer.py` + `pipeline.py` stage method

### Current flow (in `_stage_video_rendering` of pipeline.py):
1. For each (language × aspect_ratio): reconstructs scenes with visuals + audio
2. `VideoRenderer.render_video(scenes, output_format, subtitles, output_path, audio_path)` → MoviePy + ffmpeg two-pass encoding

### Migrated flow:

The Remotion API requires a two-step process: first create an audio session, then submit a render job. Content preparation (images, captions, configs) is already done in Step 7.

**6a. Create audio session**:
- `POST http://127.0.0.1:6900/api/v1/text-to-video/audio/upload`
- Multipart: `audio_file=@{lang}_narration.wav` + `transcript_file=@narration.json`
- The transcript JSON is already in Whisper format (prepared in Step 7b)
- Response: `{ "session_id": "..." }`

**6b. Submit render job**:
- `POST http://127.0.0.1:6900/api/v1/text-to-video/render`
- Multipart form:
  - `session_id` = from step 6a
  - `orientation` = `"horizontal"` (16:9) or `"vertical"` (9:16)
  - `intro_config_json` = JSON string from Step 7c intro-config
  - `intro_image` = `Intro.jpg` from Step 7a
  - `images` = content images `01.jpg` ... `10.jpg` from Step 7a
- Response: `{ "task_id": "..." }`

**6c. Poll and download**:
- SSE at `GET /api/v1/text-to-video/render/stream/{task_id}`
- Result at `GET /api/v1/text-to-video/render/result/{task_id}` → `{ "video": { "download_url": "..." } }`
- Download rendered MP4 to `stage_dir/{lang}_{ratio}_rendered.mp4`

### Key considerations:
- **Subtitles are built-in**: Remotion's `CaptionDisplay` component renders TikTok-style word-highlighted captions directly — no SRT burning needed. No post-processing ffmpeg step required.
- **Scene assembly is automatic**: Remotion's `LoopingImageSlider` cycles images over the audio duration using `imageDurationInFrames` from config. Built-in pan animation provides Ken Burns-like effects.
- Maximum **10 content images** per render. The pipeline selects the top 10 from visual asset collection.
- The Remotion API internally stages files to `remotion/news/public/main/t2v_{task_id}/` and runs `node render.js`.
- The intro template config maps from `VideoMetadata`: `{ templateId, title, brandName, tagline, url, backgroundImage }`.

### Data contract (unchanged):

```python
intermediate_results['video_rendering'] = {
    "lang_ratio": { 'path': str, 'language': str, 'aspect_ratio': str, 'resolution': tuple }
}
```

---

## Step 9: Update Pipeline Orchestration

**File to modify**: `pipeline.py`

### Changes to `_initialize_services()`:
- Import and instantiate `ApiClient` from the new module
- Remove `EdgeTTSService` initialization
- Remove `SubtitleGenerator` initialization
- Remove `SceneAssembler` initialization
- Keep `VideoIngestionService` but pass `use_api=True`
- Keep `TranscriptionService` but add API mode flag
- Remove `TranslationService` in-process model loading — delegate to `ApiClient` for translation API calls
- Keep `VisualAssetManager` but use simplified API (no scene mapping)
- Keep `VideoRenderer` for fallback, add `RemotionApiRenderer` alternative

### Changes to stage methods:
- `_stage_video_ingestion()` — delegate to `ApiClient` for download + extract-audio
- `_stage_transcription()` — delegate to `ApiClient` for whisper-stt call
- `_stage_translation()` — delegate to `ApiClient` for translation API call (segment-based mode)
- `_stage_visual_assets()` — simplified: download images, call `prepare_for_remotion()`, skip scene mapping
- `_stage_tts_synthesis()` — replace Edge TTS with VieNeu-TTS API calls
- `_stage_subtitle_generation()` — **removed**; caption JSON prepared in `_stage_remotion_content_prep()`
- `_stage_scene_assembly()` — **removed**; Remotion handles composition automatically
- `_stage_remotion_content_prep()` — **new**; prepares caption JSON + config files for Remotion
- `_stage_video_rendering()` — replace MoviePy render with Remotion API call sequence (upload session → render → download)

### Updated pipeline stage order:
```
1. Video Ingestion (API)
2. Transcription (API)
3. Translation (API — app-and-basic-tool)
4. Visual Assets (simplified — download + rename only)
5. TTS Synthesis (API)
6. Remotion Content Prep (NEW — captions + configs)
7. Video Rendering (Remotion API)
8. Export (in-process)
9. Validation (in-process)
```

### Progress callback integration:
- Each API call's SSE stream maps to `ProgressCallback.on_stage_progress()`
- Parse SSE `data:` events for `{ status, percent, message }` format (from `progress.py`)

---

## Step 10: Update Configuration

**File to modify**: `config.py`

Add new settings:

```python
# API Service URLs
api_base_url: str = Field(default="http://127.0.0.1:6900", description="app-and-basic-tool API base URL")
whisper_api_url: str = Field(default="http://127.0.0.1:6904", description="Whisper STT API base URL")
vieneu_tts_api_url: str = Field(default="http://127.0.0.1:6903", description="VieNeu-TTS API base URL")

# API behavior
use_api_services: bool = Field(default=True, description="Use REST APIs instead of in-process processing")
api_timeout: int = Field(default=600, description="API request timeout in seconds")
api_poll_interval: float = Field(default=1.0, description="SSE polling interval in seconds")

# VieNeu-TTS specific
vieneu_backbone: str = Field(default="gpu-full", description="VieNeu-TTS backbone model")
vieneu_codec: str = Field(default="neucodec-standard", description="VieNeu-TTS codec")
vieneu_voice_id: str = Field(default="", description="VieNeu-TTS voice ID for synthesis")
```

---

## Step 11: Update Tests

**Files to modify**: test files in `tests/`

- `test_video_ingestion_unit.py` — add tests for API-mode download with mocked HTTP responses
- `test_transcription_unit.py` — add tests for API-mode transcription with mocked responses
- `test_translation_api.py` — add tests for translation API calls (simple mode + segment mode) with mocked responses
- `test_tts_service.py` — replace Edge TTS tests with VieNeu-TTS API tests
- `test_video_renderer.py` — add tests for Remotion API rendering path
- `test_pipeline_integration.py` — update to test API-mode end-to-end flow
- **NEW**: `test_api_client.py` — unit tests for the API client module (SSE parsing, polling, error handling, file download)
- **NEW**: `test_remotion_content_prep.py` — test caption JSON generation, image renaming, config file creation
- **REMOVE**: `test_subtitle_generator.py` — no longer needed (Remotion handles captions)
- **REMOVE**: `test_scene_assembler.py` — no longer needed (Remotion handles composition)

**app-and-basic-tool tests** (for the new translation API tool):
- **NEW**: `python_api/app-and-basic-tool/tests/test_translation_service.py` — unit tests for translation service (model loading, segment translation, error handling)
- **NEW**: `python_api/app-and-basic-tool/tests/test_translation_router.py` — API endpoint tests (request validation, SSE streaming, result retrieval)

Use `unittest.mock.patch` on `requests.post`/`requests.get` to mock API calls.

### Unit tests:

```bash
cd python_api/REUP-YOUTUBE
pytest tests/test_api_client.py -v
pytest tests/test_video_ingestion_unit.py -v
pytest tests/test_transcription_unit.py -v
pytest tests/test_tts_service.py -v
pytest tests/test_translation_api.py -v
pytest tests/test_video_renderer.py -v
pytest tests/test_remotion_content_prep.py -v
```

### Integration test:

```bash
python run_pipeline_english.py --url "https://www.youtube.com/watch?v=TEST_VIDEO_ID"
```

---

## Decisions

- **Scope**: Migrate 8 of 9 stages (1, 2, 3, 4, 5, 6, 7, 8). Stages 4, 6, 7 are consolidated into Remotion content preparation + rendering. Stage 3 (Translation) is migrated to a new API tool in `app-and-basic-tool`. Only Export (9) and Validation (10) remain fully in-process.
- **Translation API**: New REST API tool in `app-and-basic-tool` wrapping Tencent HY-MT1.5-1.8B-FP8. Supports both simple text and segment-based translation with timestamp preservation. Model is lazy-loaded on first request and cached in-memory. Explicit `/unload` endpoint for GPU memory management.
- **Remotion consolidation**: Visual Assets (4), Subtitle Generation (6), and Scene Assembly (7) are replaced by Remotion's native capabilities — `LoopingImageSlider` for image cycling, `CaptionDisplay` for word-level captions, `calculateMainVideoMetadata` for auto-composition. This eliminates `SubtitleGenerator`, `SceneAssembler`, and scene-mapping logic.
- **TTS backend**: VieNeu-TTS API (port 6903) replaces Edge TTS. May need fallback for non-Vietnamese languages if quality is insufficient.
- **HTTP client**: Sync `requests` library — matches current blocking pipeline design, avoids async refactor.
- **Rendering**: Remotion via text-to-video API replaces MoviePy+FFmpeg renderer. Remotion handles subtitles, image slideshow, and scene composition natively — no SRT burning or explicit scene assembly needed.
- **Backward compatibility**: Add `use_api_services` config flag to allow fallback to original in-process mode.
- **Translation model placement**: Model runs inside `app-and-basic-tool` process (port 6900) sharing GPU with other services. Lazy loading + explicit unload prevents memory contention with Remotion rendering and other GPU tasks.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| API services not running | Add pre-flight health checks at pipeline start; fall back to in-process mode if `use_api_services=True` but service unreachable |
| VieNeu-TTS quality for non-Vietnamese | Test with EN/JA/DE text; keep Edge TTS as configurable fallback |
| Remotion template doesn't match expected style | Customize Remotion template or keep MoviePy renderer as fallback |
| Large file uploads over HTTP | Use chunked transfer; set appropriate timeouts (600s default) |
| Sample rate mismatch (24kHz vs 48kHz) | Add ffmpeg resample post-processing step after TTS download |
| Remotion 10-image limit | Select top 10 images by relevance score from visual assets |
| Caption sync for translated languages | Translated text uses original segment-level timestamps (not word-level). Acceptable for segment captions but less precise than original language word-level highlighting |
| Removing SubtitleGenerator/SceneAssembler | Keep old code in `_legacy/` folder for rollback if Remotion rendering proves insufficient |
| Remotion caption format compatibility | `normalizeCaptions.ts` accepts multiple formats (Whisper segments, words, flat arrays) — test with actual pipeline output to verify |
| HY-MT model GPU memory (~4GB FP8) | Lazy-load model on first translation request; provide `/unload` endpoint to free GPU memory when not needed. Unload before Remotion rendering if GPU memory is tight |
| First translation request latency (model loading) | 30-60s one-time cost. Pipeline can pre-warm the model via `/api/v1/translation/status` check or explicit first request at pipeline start |
| Translation quality parity after API migration | Same model, same generation parameters (`temperature=0.7`, `top_p=0.6`, `top_k=20`). Run A/B comparison on sample transcripts to verify identical output quality |
| GPU contention between translation and other services | Sequential pipeline stages naturally avoid overlap. If needed, unload translation model before TTS/rendering stages via `/unload` endpoint |