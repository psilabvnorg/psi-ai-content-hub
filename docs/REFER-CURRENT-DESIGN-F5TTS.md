# F5-TTS Vietnamese — Current Design Reference

Reference document describing the current design of the F5-TTS Vietnamese FastAPI system, including frontend features and backend flow.

Source: `F5-TTS-Vietnamese/fast_api/`

---

## File Overview

| File | Role |
|---|---|
| `main.py` | FastAPI backend — defines all API endpoints, voice config, TTS inference pipeline |
| `static/index.html` | Frontend SPA — main user interface (DaisyUI + Tailwind) |
| `static/app.js` | Frontend logic — form handling, SSE progress, audio playback |
| `static/translations.js` | i18n system — bilingual support Vietnamese/English |
| `static/styles.css` | Supplementary custom CSS (scrollbar, animation) |
| `requirements.txt` | Python dependencies: fastapi, uvicorn, pydantic |
| `start.sh` | Server startup script (activate venv, set env vars) |
| `test_api.sh` | API test script using curl |
| `README.md` | Installation and usage guide |

---

## Frontend Features

### 1. Voice Selection
- Dropdown loads voice list from `GET /voices`
- On voice select → calls `GET /voices/{voice_id}` to display details (name, description, gender, language)
- Displays voice info card with metadata badge

### 2. Text Input
- Textarea with character counter (displays `X / 500`)
- Warning alert when exceeding 500 characters
- Placeholder text supports i18n

### 3. Advanced Options (Collapsible)
- Speed: 0.5 – 2.0 (default 1.0)
- CFG Strength: 1.0 – 5.0 (default 2.0)
- NFE Steps: 16 / 32 / 64 (default 32)
- Remove Silence: checkbox

### 4. Generation Flow (SSE Progress Modal)
- On form submit → shows loading modal overlay (blurred background)
- Connects `EventSource` to `GET /tts/generate-audio?params`
- Modal displays:
  - Spinner animation
  - Progress percentage (0% → 100%)
  - Progress bar
  - Status text (translated based on current language)
- On completion (100%):
  - Hides spinner, shows checkmark ✓
  - Shows OK button
  - Click OK → closes modal, reveals result section
- On error → closes modal, shows error alert

### 5. Result Section
- Audio player (`<audio>` controls) — plays directly from blob URL
- Download button — downloads WAV file
- Success message with metrics (duration, file size)

### 6. Sample Previews
- Grid layout (1/2/3 columns responsive)
- Loads from `GET /samples`
- Each sample card: voice name, filename, audio player

### 7. Internationalization (i18n)
- 2 languages: Vietnamese (default), English
- Toggle buttons in header (VN / UK flags)
- Saves preference to `localStorage`
- Mechanism: `data-i18n` attribute on HTML elements → `updatePageLanguage()` traverses DOM and replaces text
- Dynamic content (voices, samples) reloads on language change via `languageChanged` event

### 8. Health Status
- Badge in header displays API status (online/offline)
- Calls `GET /healthz` on page load

---

## Backend Flow

### Architecture
```
Browser ──HTTP──▶ FastAPI (uvicorn, port 8000)
                    │
                    ├── Static files (index.html, app.js, ...)
                    ├── REST API (voices, samples, healthz)
                    └── SSE endpoint (tts/generate-audio)
                          │
                          └── subprocess: f5-tts_infer-cli
                                │
                                ├── Model: model/model_last.pt
                                ├── Vocab: model/vocab.txt
                                └── Ref audio: original_voice_ref/<voice>/*.wav
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET /` | Serves `index.html` |
| `GET /healthz` | Health check — returns `{ status, version, timestamp }` |
| `GET /voices` | List of all voices (id, name, description, gender, language) |
| `GET /voices/{voice_id}` | Detail for a single voice (includes ref_text, sample_rate, stats) |
| `POST /synthesize` | Sync TTS — runs inference, returns JSON result (no streaming) |
| `GET /tts/generate-audio` | Async TTS with SSE progress — primary endpoint used by frontend |
| `GET /samples` | List of sample audio files |

### Voice Configuration
- 16 voices are hardcoded in the `VOICES` dict in `main.py`
- Each voice contains: `name`, `description`, `language`, `gender`, `audio` (path to ref wav), `ref_text` (transcript of ref audio)
- Ref audio files are located at `original_voice_ref/<voice_folder>/<file>.wav`

### TTS Inference Flow (`GET /tts/generate-audio`)

1. Validate input: text (1–5000 chars), voice_id exists, speed (0.5–2.0), cfg_strength (1.0–5.0)
2. Resolve ref audio path from `VOICES[voice_id]`
3. Generate output filename: `output_{timestamp}.wav`
4. Build `f5-tts_infer-cli` command with parameters:
   - `--model F5TTS_Base`
   - `--ref_audio`, `--ref_text` (from voice config)
   - `--gen_text` (user input text)
   - `--speed`, `--vocoder_name vocos`
   - `--vocab_file`, `--ckpt_file` (model files)
   - `--output_dir`, `--output_file`
   - `--remove_silence` (optional)
5. Run subprocess async (`asyncio.create_subprocess_exec`)
6. Stream SSE events while reading stdout:
   - Parse `gen_text` → progress 0–30% (processing text)
   - Parse batch progress `X/Y [...]` → progress 30–90% (generating audio)
   - Parse `XX%` → fine-grained progress within batch
7. When subprocess finishes:
   - Read output WAV file → encode to base64
   - Send final SSE event containing `audio_data` (base64), `filename`, `duration`, `file_size`
   - Frontend decodes base64 → creates Blob → sets audio player src

### Sync Synthesize Flow (`POST /synthesize`)
- Simpler endpoint, uses `subprocess.run` (blocking)
- Returns JSON `{ status, voice, text, output_file, message }`
- No progress streaming

### Sample Sync
- On server startup → `sync_samples()` copies all WAVs from `original_voice_ref/` into `static/samples/`
- Naming convention: `{voice_id}_{original_filename}.wav`
- `GET /samples` refreshes cache on each request

### CORS
- Allows all origins (`allow_origins=["*"]`)

### Environment
- `HF_HOME` and `HF_HUB_CACHE` set to `/home/psilab/.cache/huggingface`
- Server runs on `0.0.0.0:8000`
