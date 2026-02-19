# REUP-YOUTUBE — Multilingual Video Pipeline

Automated system that transforms YouTube videos into multilingual versions with replaced visuals and TTS narration. The pipeline downloads a video, transcribes it, translates to target languages, generates speech, collects images, and renders final videos via Remotion.

## Architecture Overview

The pipeline delegates heavy processing to REST API microservices running in the `python_api/` ecosystem. Only lightweight orchestration, image downloading, and final export/validation run in-process.

### API Services (must be running)

| Service | Port | Responsibility |
|---------|------|----------------|
| **app-and-basic-tool** | 6901 | Video download, audio extraction, Remotion rendering |
| **Translation** | 6906 | Tencent HY-MT translation (segment-based API) |
| **ImageFinder** | 6907 | LLM query generation + multi-source image search and ranking |
| **whisper-stt** | 6904 | Speech-to-text transcription with word-level timestamps |
| **VieNeu-TTS** | 6903 | Text-to-speech synthesis |

### Pipeline Stages

```
1. Video Ingestion  ──>  2. Transcription  ──>  3. Translation
        |                                              |
        v                                              v
4. Visual Assets  ──>  5. TTS Synthesis  ──>  6. Remotion Content Prep
                                                       |
                                                       v
                                              7. Video Rendering  ──>  8. Export  ──>  9. Validation
```

| # | Stage | Method | Description |
|---|-------|--------|-------------|
| 1 | **Video Ingestion** | API (port 6901) | Downloads YouTube video via yt-dlp, extracts audio to WAV |
| 2 | **Transcription** | API (port 6904) | Whisper large-v3 with word-level timestamps and punctuation |
| 3 | **Translation** | API (port 6906) | Tencent HY-MT1.5-1.8B-FP8 model, segment-by-segment with context |
| 4 | **Visual Assets** | API + In-process | ImageFinder API searches/scores images, pipeline stages/renames files to `01.jpg`..`10.jpg` for Remotion |
| 5 | **TTS Synthesis** | API (port 6903) | VieNeu-TTS generates narration audio per language |
| 6 | **Remotion Content Prep** | In-process | Prepares caption JSON, video-config, intro-config for Remotion |
| 7 | **Video Rendering** | API (port 6901) | Remotion renders video with image slideshow, captions, and intro overlay |
| 8 | **Export** | In-process | FFmpeg optimization for target platforms |
| 9 | **Validation** | In-process | Quality checks on final output |

### Supported Languages

Vietnamese (vi), English (en), Japanese (ja), German (de), Chinese (zh), Korean (ko), French (fr), Spanish (es)

### Output Formats

- **Horizontal (16:9)** — YouTube
- **Vertical (9:16)** — TikTok / Facebook Reels

---

## Project Structure

```
python_api/REUP-YOUTUBE/
  run_pipeline_english.py          # CLI entry point
  requirements.txt                 # Runtime dependencies
  .env.example                     # Environment config template
  setup.py                         # Package setup
  pytest.ini                       # Test configuration

  src/multilingual_video_pipeline/
    __init__.py
    config.py                      # Settings (pydantic-settings, .env support)
    models.py                      # Data models (Transcript, TranslatedScript, etc.)
    logging_config.py              # Structured logging (structlog)

    services/
      pipeline.py                  # Main orchestrator — runs all stages sequentially
      api_client.py                # Shared HTTP client for all API calls (SSE polling, file download)
      video_ingestion.py           # Stage 1 — video download + audio extraction
      transcription.py             # Stage 2 — Whisper STT via API
      translation.py               # Stage 3 — Tencent HY-MT via API
      visual_asset_manager.py      # Stage 4 — image search, download, Remotion prep
      tts.py                       # Stage 5 — VieNeu-TTS via API
      remotion_renderer.py         # Stages 6-7 — content prep + Remotion render API
      export_manager.py            # Stage 8 — FFmpeg platform export
      validation_service.py        # Stage 9 — output quality checks
      job_orchestrator.py          # Job queue management
      edge_tts_service.py          # Legacy Edge TTS (fallback)
      subtitle_generator.py        # Legacy subtitle generation (replaced by Remotion)
      scene_assembler.py           # Legacy scene assembly (replaced by Remotion)
      video_renderer.py            # Legacy MoviePy renderer (replaced by Remotion)

    utils/
      file_utils.py                # File operations
      time_utils.py                # Timestamp formatting
      validation.py                # Input validation helpers

  tests/                           # See "Testing" section below
  docs/
    implementation-plan.md         # Full migration plan with API contracts
  scripts/                         # Development utility scripts
  cache/                           # Runtime cache (images, jobs, outputs)
```

---

## Prerequisites

- Python 3.9+
- FFmpeg installed and in PATH
- Required API services running (see ports table above)

## Installation

```bash
cd python_api/REUP-YOUTUBE

# Create virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # Linux/Mac

# Install package
pip install -e .

# Or install dependencies directly
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env as needed
```

### Key Configuration

Settings are managed via `config.py` using pydantic-settings. Configure through `.env` or environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_API_SERVICES` | `True` | Use REST APIs (set `False` for legacy in-process mode) |
| `API_BASE_URL` | `http://127.0.0.1:6901` | app-and-basic-tool API |
| `TRANSLATION_API_URL` | `http://127.0.0.1:6906` | Translation API |
| `IMAGE_FINDER_API_URL` | `http://127.0.0.1:6907` | ImageFinder API |
| `WHISPER_API_URL` | `http://127.0.0.1:6904` | Whisper STT API |
| `VIENEU_TTS_API_URL` | `http://127.0.0.1:6903` | VieNeu-TTS API |
| `API_TIMEOUT` | `600` | API request timeout (seconds) |
| `TARGET_LANGUAGES` | `vi,ja,de,en` | Languages to translate into |
| `AUDIO_SAMPLE_RATE` | `48000` | Output audio sample rate (Hz) |
| `TARGET_LUFS` | `-16.0` | Audio loudness normalization |
| `VIDEO_CODEC` | `h264_nvenc` | Video codec (`h264_nvenc` for GPU, `libx264` for CPU) |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## Running the Pipeline

### Quick Start

```bash
# Process a YouTube video, output in English 16:9
python run_pipeline_english.py --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Multiple output formats
python run_pipeline_english.py --url "https://www.youtube.com/watch?v=VIDEO_ID" --formats 16:9 9:16
```

### Programmatic Usage

```python
from src.multilingual_video_pipeline.config import get_settings
from src.multilingual_video_pipeline.services import MultilingualVideoPipeline, ProgressCallback

settings = get_settings()
pipeline = MultilingualVideoPipeline(settings, ProgressCallback())

job_id = pipeline.submit_job(
    video_url="https://www.youtube.com/watch?v=VIDEO_ID",
    target_languages=["en", "vi"],
    output_formats=["16:9"],
)
result = pipeline.process_job(job_id)
```

### Before Running

Ensure API services are started:

1. **app-and-basic-tool** on port 6901 — handles video download and Remotion rendering
2. **Translation** on port 6906 — handles transcript translation (`/api/v1/translation/translate`)
3. **ImageFinder** on port 6907 — handles image search (`/api/v1/image-finder/search`)
4. **whisper-stt** on port 6904 — handles transcription (Whisper model must be loaded)
5. **VieNeu-TTS** on port 6903 — handles TTS (model must be loaded via `/api/v1/models/load`)

The translation model (Tencent HY-MT1.5-1.8B-FP8, ~4GB FP8) auto-downloads on first use to `%APPDATA%/psi-ai-content-hub/models/translation/`. First translation request takes 30-60s for model loading; subsequent requests reuse the cached model.

---

## Testing

```bash
cd python_api/REUP-YOUTUBE

# Run all tests
pytest

# By category
pytest -m unit            # Unit tests (mocked API calls)
pytest -m integration     # Integration tests (requires running services)
pytest -m property        # Property-based tests (hypothesis)

# Individual test files
pytest tests/test_api_client.py -v              # API client (SSE, polling, downloads)
pytest tests/test_video_ingestion_unit.py -v    # Video ingestion stage
pytest tests/test_transcription_unit.py -v      # Transcription stage
pytest tests/test_translation_api.py -v         # Translation API calls
pytest tests/test_tts_service.py -v             # TTS synthesis
pytest tests/test_remotion_content_prep.py -v   # Remotion content preparation
pytest tests/test_remotion_service.py -v        # Remotion rendering service
pytest tests/test_video_renderer.py -v          # Video renderer
pytest tests/test_visual_asset_manager.py -v    # Image search and download
pytest tests/test_export_manager.py -v          # Export optimization
pytest tests/test_validation_service.py -v      # Output validation
pytest tests/test_models_unit.py -v             # Data model tests
pytest tests/test_models_property.py -v         # Property-based model tests
pytest tests/test_pipeline_integration.py -v    # End-to-end pipeline

# With coverage
pytest --cov=src/multilingual_video_pipeline
```

### Integration Test (end-to-end)

Requires all API services running:

```bash
python run_pipeline_english.py --url "https://www.youtube.com/watch?v=TEST_VIDEO_ID"
```

---

## API Contracts Reference

See [docs/implementation-plan.md](docs/implementation-plan.md) for full API request/response formats, SSE stream event formats, and data contracts between pipeline stages.

### Key API Endpoints Used

| Stage | Method | Endpoint | Service |
|-------|--------|----------|---------|
| Video Download | POST | `/api/v1/video/download` | app-and-basic-tool |
| Audio Extraction | POST | `/api/v1/video/extract-audio` | app-and-basic-tool |
| Transcription | POST | `/api/v1/transcribe` | whisper-stt |
| Translation | POST | `/api/v1/translation/translate` | Translation |
| Translation Status | GET | `/api/v1/translation/status` | Translation |
| TTS Generate | POST | `/api/v1/generate` | VieNeu-TTS |
| Image Search | POST | `/api/v1/image-finder/search` | ImageFinder |
| Audio Upload | POST | `/api/v1/text-to-video/audio/upload` | app-and-basic-tool |
| Remotion Render | POST | `/api/v1/text-to-video/render` | app-and-basic-tool |

All async jobs follow the same pattern: `POST` to start -> SSE stream for progress -> `GET` result when complete.
