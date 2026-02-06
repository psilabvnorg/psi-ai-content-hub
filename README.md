# PSI AI Content Hub


## Scripts

- `npm run dev` - Start Express server only
- `npm run electron:dev` - Start server + Electron
- `npm run build` - Build for production
- `npm run electron:build` - Build Electron installer
- `npm run electron:pack` - Build unpacked (for testing)


**Windows (winget):**
```bash
winget install yt-dlp
winget install ffmpeg
```

**Windows (manual):**
- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
- ffmpeg: https://ffmpeg.org/download.html

Desktop application for video/audio downloading, conversion, and processing tools.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend**: Node.js + Express 5
- **Desktop**: Electron 28
- **Tools**: yt-dlp (video download), ffmpeg (audio/video processing)

## Prerequisites

Install these CLI tools before running:

```bash
# yt-dlp (video downloading)
winget install yt-dlp
# Or: https://github.com/yt-dlp/yt-dlp/releases

# ffmpeg (audio/video processing)
winget install ffmpeg
# Or: https://ffmpeg.org/download.html
```

## Getting Started

```bash
# Install dependencies
npm install

# Development (web)
npm run dev

# Development (Electron)
npm run electron:dev

# Build for production
npm run build

# Build Electron installer
npm run electron:build
```

## Features

- **Video Downloader** - YouTube, TikTok, Facebook, Instagram
- **Audio Extractor** - Extract MP3/WAV from video files
- **TTS Fast** - Vietnamese Text-to-Speech (on-demand download, Ollama-style)
- **Video Trimmer** - Trim videos to specific time ranges
- **Speed Adjuster** - Change playback speed (0.5x - 2x)
- **Audio Converter** - Convert between audio formats

> **Note**: TTS runs on Node only and downloads models on first use (~300MB-800MB depending on model). See [TTS_SETUP.md](TTS_SETUP.md)

## Project Structure

```
├── client/           # React frontend (Vite)
├── server/           # Express backend
├── electron/         # Electron main process
├── shared/           # Shared types/utilities
├── dist/             # Built files
└── release/          # Electron installers
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `POST /api/download/video` | Start video download |
| `GET /api/progress/:id` | SSE progress stream |
| `POST /api/extract/audio` | Extract audio from URL |
| `POST /api/extract/audio/upload` | Extract audio from file |
| `POST /api/convert/audio` | Convert audio format |
| `POST /api/trim/video` | Trim video from URL |
| `POST /api/trim/video/upload` | Trim uploaded video |
| `POST /api/adjust/speed` | Adjust video speed |
| `POST /api/adjust/speed/upload` | Adjust uploaded video speed |
| `GET /api/files/:filename` | Download processed file |
| `POST /api/cleanup` | Clean temp files |
| `GET /api/storage/info` | Get storage info |

## License

MIT
