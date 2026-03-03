# PSI AI CONTENT HUB - Claude Code Instructions

## Project Overview

**PSI AI CONTENT HUB** (`psi-ai-content-hub`) is an Electron-based desktop application for video/audio downloading, media processing, and AI-powered content tools. It bundles a React frontend with a Python FastAPI backend.

## Architecture

```
psi-ai-content-hub/
├── client/               # React frontend (Vite root)
│   └── src/
│       ├── pages/tools/  # Feature pages (one per tool)
│       ├── components/   # Shared UI components (shadcn/ui)
│       ├── hooks/        # Custom React hooks
│       └── context/      # React context providers
├── python_api/
│   └── app-6901/         # FastAPI backend (port 6901)
│       └── app/
│           ├── routers/  # API route handlers
│           └── services/ # Business logic
├── electron/             # Electron main/preload scripts (CJS)
├── shared/               # Shared TypeScript types/schema
├── script/               # Build scripts
└── remotion/             # Remotion video rendering (if used)
```

## Key Technologies

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix UI), wouter, TanStack Query
- **Backend**: Python 3.10, FastAPI, uvicorn (port 6901)
- **Desktop**: Electron 28, electron-builder
- **Database**: PostgreSQL + Drizzle ORM (optional features)
- **Testing**: Vitest (unit)
- **Package manager**: npm

## Available Tools / Pages

Audio: AudioConverter, AudioExtractor, AudioTrimmer, SpeedAdjuster
Video: VideoDownloader (yt-dlp), VideoTrimmer, TextToVideo, ReupYoutube, MergeOverlay
Image: BackgroundRemoval, ImageFinder, ImageUpscaler, ColorPicker, LogoGeneratorPrompt, ThumbnailCreator
AI/Speech: TTSFast (edge-tts), VoiceClone, VoiceCloneCustom, SpeechToText, Translator, LLM, TextGenerator
Other: NewsScraper, BackendConsole

## Development Commands

### Frontend

```bash
npm run dev                # Vite dev server on port 5000
npm run electron:dev       # Full Electron dev (frontend + Electron, concurrently)
npm run build              # Production build (tsx script/build.ts)
npm run electron:build     # Build Electron distributable
npm run electron:pack      # Pack Electron (no installer)
```

### Code Quality (run after changes)

```bash
npm run check              # tsc + naming convention check
npm run check:naming       # Naming convention check only (axxx_bbb_ccc_dd format)
npm run test:unit          # Vitest unit tests
```

### Database

```bash
npm run db:push            # Push Drizzle schema to PostgreSQL (requires DATABASE_URL)
```

## Python Backend Setup

**Requires Python 3.10** — use a venv from the repo root.

```bash
# Create and activate venv
python -m venv venv
venv\Scripts\activate          # Windows

# Install dependencies
pip install -r python_api\app-6901\requirements.txt

# Run the API (port 6901)
python -m python_api.app-6901.app.main
```

Key Python dependencies: `fastapi`, `uvicorn`, `yt-dlp`, `openai-whisper`, `torch`, `transformers`, `edge-tts`, `selenium`, `beautifulsoup4`, `opencv-python`

## Storage Paths (Windows)

- **Models**: `%APPDATA%\psi-ai-content-hub\models`
- **Logs**: `%APPDATA%\psi-ai-content-hub`
- **Temp media output**: `%LOCALAPPDATA%\Temp\psi_ai_content_hub\`
- **Tools/model download links**: `python_api/app-6901/app/services/tools_manager.py`

## Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

## Code Style & Conventions

- Follow existing TypeScript patterns; `strict: true` is enforced
- Do not use `any` — use `unknown` when the type is truly unknown
- File naming uses `axxx_bbb_ccc_dd` naming convention (enforced by `check:naming` script)
- Use shadcn/ui components (`client/src/components/ui/`) for all new UI

## Important Notes

- `python_api/app-6901/test-script/` is a unit test folder — skip it in context unless explicitly asked about it
- The Electron entry point is `electron/main.cjs`
- Frontend talks to the Python API at `http://127.0.0.1:6901`
- `shared/schema.ts` defines the Drizzle/PostgreSQL schema
