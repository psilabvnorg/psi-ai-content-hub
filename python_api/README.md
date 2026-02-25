# PSI AI CONTENT HUB Python APIs

This folder contains FastAPI services used by the desktop app.

## Services and Ports

1. `app-6901` -> `6901`
2. `F5-TTS` -> `6902`
3. `VieNeu-TTS` -> `6903`

Only `F5-TTS` stays isolated in its own venv/process. Non-F5 APIs are merged into `app-6901`.

## Merged API Bases on 6901

- `http://127.0.0.1:6901/whisper`
- `http://127.0.0.1:6901/bg-remove-overlay`
- `http://127.0.0.1:6901/translation`
- `http://127.0.0.1:6901/image-search`

Endpoint shapes remain the same after these prefixes. Examples:

- `/whisper/api/v1/transcribe`
- `/bg-remove-overlay/api/v1/remove/upload`
- `/translation/api/v1/translation/translate`
- `/image-search/api/v1/image-finder/search`

## Shared Model Directory

All services download/read models from:

`C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/`

## Running Services

From each service folder, activate its venv, then run:

```bash
python -m app.main
```

## API Base

All routes are still versioned under `/api/v1` (with the service prefix where applicable).

## Per-Service Environment Setup

Merged services expose:

- `GET /<service-prefix>/api/v1/env/status`
- `POST /<service-prefix>/api/v1/env/install`

F5 still exposes:

- `GET /api/v1/env/status`
- `POST /api/v1/env/install`
