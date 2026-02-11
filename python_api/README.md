# PSI AI CONTENT HUB Python APIs

This folder contains four standalone FastAPI services. Each service runs in its own venv and listens on its own port.

## Services & Ports

1. `app-and-basic-tool` → `6901`
2. `F5-TTS` → `6902`
3. `VieNeu-TTS` → `6903`
4. `whisper-stt` → `6904`

## Shared Model Directory

All services download/read models from:

`C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/`

## Running Services

From each service folder, activate its venv, then run:

```bash
python -m app.main
```

## API Base

All routes are under `/api/v1`.

## Per‑Service Environment Setup

Each service exposes:

- `GET /api/v1/env/status`
- `POST /api/v1/env/install`

These operate **within that service’s venv**.

## Model Download Endpoints

Each service handles its own model downloads:

- F5‑TTS: `POST /api/v1/models/download`
- VieNeu‑TTS: `POST /api/v1/models/download`
- Whisper‑STT: `POST /api/v1/models/download`

## System Tools (App Service Only)

- `GET /api/v1/tools/status`
- `POST /api/v1/tools/install`
