# Fast TTS - Design Document

## Overview

The "Fast TTS" feature converts text to speech using VieNeu-TTS, a Vietnamese TTS engine.
It uses a Python REST API server approach, identical to the F5-TTS Voice Clone architecture.

The Python FastAPI server runs on `127.0.0.1:8189` and handles model loading, voice management,
and TTS inference. The frontend communicates directly via HTTP + SSE.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │  TTSFast.tsx  │───>│  HTTP fetch() to 127.0.0.1:8189         │   │
│  │  (UI + state) │    │  + EventSource for SSE progress          │   │
│  └──────────────┘    └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│                    PYTHON SERVER (FastAPI)                           │
│                    tts-fast-server.py :8189                          │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐    │
│  │  Endpoints:                                                  │    │
│  │  GET  /health                                                │    │
│  │  GET  /tts-fast/status          — server + model status      │    │
│  │  GET  /tts-fast/voices          — list preset voices         │    │
│  │  GET  /tts-fast/samples         — list sample voices/texts   │    │
│  │  GET  /tts-fast/model/configs   — available backbones/codecs │    │
│  │  GET  /tts-fast/model/status    — current model info         │    │
│  │  POST /tts-fast/model/load      — load model (SSE progress)  │    │
│  │  POST /tts-fast/start           — start generation           │    │
│  │  GET  /tts-fast/progress/:id    — SSE progress stream        │    │
│  │  GET  /tts-fast/result/:id      — get final result JSON      │    │
│  │  GET  /tts-fast/download/:id    — download generated WAV     │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                             │                                       │
│                    VieNeu-TTS Engine (in-process)                    │
│                    - VieNeuTTS / FastVieNeuTTS                       │
│                    - config.yaml for backbone/codec/voice configs    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ELECTRON (main.cjs)                               │
│  - Spawns tts-fast-server.py on app start (if venv ready)           │
│  - IPC handlers: tts-fast:status, tts-fast:start-server,            │
│    tts-fast:stop-server                                             │
│  - Kills server on app quit                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Load Model

```
User selects backbone + codec → clicks "Load Model"
  → POST /tts-fast/model/load { backbone, codec, device }
  → Server returns SSE stream with loading progress
  → Frontend shows progress bar
  → On complete: model_loaded = true, generate button enabled
```

### 2. Generate Speech

```
User enters text, selects voice → clicks "Generate Speech"
  → POST /tts-fast/start { text, mode, voice_id }
  → Server returns { task_id }
  → Frontend opens EventSource to /tts-fast/progress/{task_id}
  → SSE events: starting → initializing → loading → generating → writing → complete
  → On complete: frontend gets download URL, shows audio player
```

### 3. Progress Tracking (SSE)

```
Client ──GET SSE──> /tts-fast/progress/{task_id}
                      │
                      ├─ Poll progress_store every 300ms
                      │    └─ yield SSE event with status, percent, message, logs
                      │
                      └─ On complete/error: stream ends
```

---

## Electron Integration

The Electron main process manages the Python server lifecycle:

- On app start: if venv `.ready.json` exists, spawn `tts-fast-server.py` on port 8189
- Shares the same Python venv as Voice Clone (created via `uv`)
- IPC handlers exposed via preload:
  - `ttsFastStatus()` — check runtime + server status
  - `ttsFastStartServer()` — start server if not running
  - `ttsFastStopServer()` — stop server

The frontend talks directly to the Python server via HTTP (same as VoiceClone.tsx).

---

## Frontend (TTSFast.tsx)

Features:
- Mode selection: Preset Voice / Custom Voice
- Preset: dropdown of voices from `/tts-fast/voices`
- Custom: select sample voice + sample text from `/tts-fast/samples`
- Model loading UI with backbone/codec selection
- Text input with character counter (max 3000)
- SSE-based progress bar with log viewer
- Audio player + download button on completion

---

## Configuration

VieNeu-TTS uses `config.yaml` in the project root for:
- `backbone_configs` — available backbone models
- `codec_configs` — available codec models
- `voice_samples` — preset voice definitions (audio path, text path)
- `text_settings` — max chars per chunk

---

## Error Handling

| Scenario                  | Behavior                                              |
|---------------------------|-------------------------------------------------------|
| Server not reachable      | Warning banner with retry button                      |
| Runtime not set up        | Warning: "Set up Voice Clone runtime first"           |
| Model not loaded          | Model loading UI shown, generate button disabled      |
| Generation fails          | Progress shows error, toast notification               |
| SSE connection lost       | EventSource onerror closes stream, shows error toast  |
