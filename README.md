# PSI AI CONTENT HUB

A desktop application for video/audio downloading, media processing, and AI-powered content tools. Built with Electron, React, and a Python FastAPI backend.

## Features

| Category | Tools |
|----------|-------|
| **Video** | Downloader (yt-dlp), Trimmer, Text-to-Video, Reup YouTube, Merge Overlay |
| **Audio** | Converter, Extractor, Trimmer, Speed Adjuster |
| **Image** | Background Removal, Upscaler, Finder, Color Picker, Logo Generator, Thumbnail Creator |
| **AI / Speech** | TTS (edge-tts), Voice Clone, Speech-to-Text, Translator, LLM, Text Generator |
| **Other** | News Scraper, Backend Console |

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, wouter, TanStack Query
- **Backend**: Python 3.10, FastAPI, uvicorn
- **Desktop**: Electron 28, electron-builder
- **Database**: PostgreSQL + Drizzle ORM (optional)

## Getting Started

### Frontend

```bash
npm install

# Web dev server (port 5000)
npm run dev

# Full Electron dev (frontend + Electron together)
npm run electron:dev
```

### Backend (Python 3.10)

The backend consists of up to 3 services. For most tools, only `app-6901` is needed.

**app-6901** (port 6901) — main merged API:

```bash
cd python_api/app-6901
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

**F5-TTS** (port 6902) — runs in its own isolated venv:

```bash
cd python_api/F5-TTS
# follow its own setup instructions
python -m app.main
```

**VieNeu-TTS** (port 6903):

```bash
cd python_api/VieNeu-TTS
python -m app.main
```

> Use each service's own venv so model dependencies stay isolated.

## Building

```bash
npm run build              # Production frontend build
npm run electron:build     # Build Electron installer (output: release/)
npm run electron:pack      # Pack without creating installer
```

## API Endpoints (port 6901)

| Prefix | Description |
|--------|-------------|
| `/whisper/api/v1` | Speech-to-text |
| `/bg-remove-overlay/api/v1` | Background / overlay removal |
| `/translation/api/v1` | Translation |
| `/image-search/api/v1` | Image search / finder |

All routes are versioned under `/api/v1`.

## Storage Paths (Windows)

| Purpose | Path |
|---------|------|
| Models | `%APPDATA%\psi-ai-content-hub\models` |
| Logs | `%APPDATA%\psi-ai-content-hub` |
| Temp media | `%LOCALAPPDATA%\Temp\psi_ai_content_hub\` |

Tool/model download links are managed in `python_api/app-6901/app/services/tools_manager.py`.

## Code Quality

```bash
npm run check              # TypeScript check + naming convention lint
npm run test:unit          # Vitest unit tests
npm run db:push            # Push DB schema (requires DATABASE_URL)
```
