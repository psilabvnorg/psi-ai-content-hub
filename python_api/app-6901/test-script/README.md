# Unit Tests — app-6901 Services

Tests for all service modules in `app/services/`.

## Requirements

Use the project venv (has all dependencies pre-installed):

```
python_api\app-6901\venv\
```

No extra installs needed — torch, transformers, whisper, cv2, edge_tts, yt_dlp, etc. are all present.

## Run Tests

From the `app-6901` directory:

```bash
# All tests
venv\Scripts\pytest.exe test-script\ -v

# Single file
venv\Scripts\pytest.exe test-script\test_env.py -v

# Collect only (dry run)
venv\Scripts\pytest.exe test-script\ --collect-only -q
```

## Test Files

| File | Service |
|---|---|
| `test_aenv_profile_service_api.py` | venv profile management |
| `test_edge_tts.py` | Microsoft Edge TTS synthesis |
| `test_env.py` | dependency checks and install |
| `test_files.py` | file download/retrieval |
| `test_llm.py` | Ollama LLM integration |
| `test_media.py` | ffmpeg video/audio processing |
| `test_remove_overlay.py` | background removal model |
| `test_sources.py` | image search sources |
| `test_stt.py` | Whisper speech-to-text |
| `test_system.py` | system status and temp cache |
| `test_text_to_video.py` | text-to-video pipeline |
| `test_tools_manager.py` | ffmpeg/yt-dlp/torch tool detection |
| `test_translation.py` | NLLB translation model |
| `test_video.py` | yt-dlp video download |

## What Is Mocked

- **subprocess calls** — no real ffmpeg/yt-dlp processes spawned
- **HTTP requests** — `urlopen`, `requests.get/post` replaced with fakes
- **Model loading** — `from_pretrained` never called; module-level `_model` globals patched directly
- **File paths** — `TEMP_DIR`, `MODEL_DIR` redirected to `tmp_path`
- **Background threads** — `threading.Thread` patched to prevent threads running during tests

Real behavior is tested for pure functions, data-structure logic, and status checks.
