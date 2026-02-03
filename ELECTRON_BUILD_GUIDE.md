# Electron Build Guide

## Prerequisites

1. **Node.js 18+** - Required for running the app
2. **yt-dlp** - For video downloading
3. **ffmpeg** - For audio/video processing

### Installing yt-dlp and ffmpeg

**Windows (winget):**
```bash
winget install yt-dlp
winget install ffmpeg
```

**Windows (manual):**
- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
- ffmpeg: https://ffmpeg.org/download.html

Add both to your system PATH.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev
```

This starts both the Express server and Electron app.

## Building for Production

```bash
# Build the app
npm run electron:build
```

Output will be in the `release/` folder.

## Bundling yt-dlp and ffmpeg

For a fully self-contained installer, place the executables in a `bin/` folder:

```
bin/
├── yt-dlp.exe
└── ffmpeg.exe
```

These will be bundled with the installer via `extraResources` in package.json.

## Project Structure

```
├── client/           # React frontend (Vite)
├── server/           # Express backend
│   └── routes.ts     # API endpoints
├── electron/         # Electron main process
│   ├── main.cjs      # Main process entry
│   └── preload.cjs   # Preload script
├── dist/             # Built files
└── release/          # Electron installers
```

## Scripts

- `npm run dev` - Start Express server only
- `npm run electron:dev` - Start server + Electron
- `npm run build` - Build for production
- `npm run electron:build` - Build Electron installer
- `npm run electron:pack` - Build unpacked (for testing)
