# Fast TTS - Design Document

## Overview

The "Super Fast TTS" feature converts text to speech using a lightweight model (`Xenova/mms-tts-vie`, ~300MB) that runs entirely on the user's device. It follows an Ollama-style UX: models are downloaded on-demand the first time the user clicks "Generate Speech".

The system supports two runtime modes:
- **Electron mode**: IPC-based communication (main process → forked server → child TTS runner)
- **Web mode**: HTTP/SSE-based communication (Express server → child TTS runner)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │  TTSFast.tsx  │───>│  ipc-client  │    │   TTSProgress.tsx     │  │
│  │  (UI + state) │    │  or fetch()  │    │   (progress bar)      │  │
│  └──────────────┘    └──────┬───────┘    └───────────┬───────────┘  │
│                             │                        │              │
│         Electron: IPC       │          Electron: poll get-tts-progress
│         Web: POST /api/...  │          Web: SSE /api/tts/progress/:id
└─────────────────────────────┼────────────────────────┼──────────────┘
                              │                        │
┌─────────────────────────────┼────────────────────────┼──────────────┐
│                       BACKEND                        │              │
│                             ▼                        │              │
│  ┌──────────────────────────────────────┐            │              │
│  │  server-handlers.cjs / routes.ts     │◄───────────┘              │
│  │  - tts-fast-progress handler         │                           │
│  │  - get-tts-progress handler          │                           │
│  │  - tts-status / tts-setup handlers   │                           │
│  │  - ttsProgressStore (Map)            │                           │
│  └──────────────┬───────────────────────┘                           │
│                 │ spawn child process                               │
│                 ▼                                                    │
│  ┌──────────────────────────────────────┐                           │
│  │  tts-runner.mjs                      │                           │
│  │  - @xenova/transformers pipeline     │                           │
│  │  - Reads payload from stdin (JSON)   │                           │
│  │  - Emits progress to stderr (JSON)   │                           │
│  │  - Writes final result to stdout     │                           │
│  │  - Writes WAV file to disk           │                           │
│  └──────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Generate Speech (with progress)

```
User clicks "Generate Speech"
  │
  ├─ Electron: ipcApi.ttsFastProgress(text)
  │    → main.cjs relays to server.cjs via process.send()
  │    → server-handlers.cjs 'tts-fast-progress' handler
  │
  └─ Web: POST /api/tts/fast/progress { text }
       → routes.ts handler
       │
       ▼
  Handler creates ttsId, stores initial progress in ttsProgressStore,
  starts runTtsFastTask() in background (non-blocking), returns { ttsId }
       │
       ▼
  Client receives ttsId, renders <TTSProgress ttsId={ttsId} />
       │
       ▼
  TTSProgress polls/streams for updates until complete or error
```

### 2. TTS Runner Process (tts-runner.mjs)

```
stdin ──JSON payload──> tts-runner.mjs
                            │
                            ├─ Load @xenova/transformers pipeline
                            ├─ Emit progress to stderr as JSON lines:
                            │    {"type":"progress","stage":"initializing","percent":10}
                            │    {"type":"progress","stage":"loading","percent":30}
                            │    {"type":"progress","stage":"generating","percent":60}
                            │    {"type":"progress","stage":"writing","percent":80}
                            │    {"type":"progress","stage":"complete","percent":100}
                            │
                            ├─ Write WAV file to output_path
                            │
                            └─ Write final JSON result to stdout:
                                 {"status":"success","duration":2.5,"sample_rate":24000}
```

The parent process (server-handlers.cjs) parses stderr lines for progress JSON and updates `ttsProgressStore`. On process exit, it parses the last stdout line for the final result.

---

## Progress Tracking

### Progress Store

Both Electron and Web backends use an in-memory `Map<string, ProgressData>`:

```typescript
interface ProgressData {
  status: 'waiting' | 'starting' | 'initializing' | 'loading' | 'generating' | 'writing' | 'complete' | 'error';
  message: string;
  percent: number;        // 0-100
  filePath?: string;      // set on complete
  filename?: string;      // set on complete
  downloadUrl?: string;   // set on complete (web mode only)
  duration?: number;      // set on complete
}
```

### Progress Stages

| Stage          | Percent | Description                        |
|----------------|--------:|------------------------------------|
| `starting`     |      0% | Handler received request           |
| `initializing` |     10% | Loading transformers pipeline      |
| `loading`      |     30% | Model loaded, processing text      |
| `generating`   |     60% | Running inference                  |
| `writing`      |     80% | Writing WAV to disk                |
| `complete`     |    100% | Done, file ready                   |
| `error`        |      0% | Something failed                   |

### Electron Mode: Polling

`TTSProgress.tsx` polls `get-tts-progress` every 300ms via IPC:

```
Client ──poll every 300ms──> main.cjs ──IPC──> server.cjs
                                                  │
                                    ttsProgressStore.get(ttsId)
                                                  │
Client <──────────────────── reply ◄──────────────┘
```

### Web Mode: Server-Sent Events (SSE)

`TTSProgress.tsx` opens an `EventSource` to `/api/tts/progress/:ttsId`:

```
Client ──GET SSE──> Express route
                      │
                      ├─ setInterval(300ms)
                      │    └─ ttsProgressStore.get(ttsId)
                      │    └─ res.write(`data: ${JSON.stringify(progress)}\n\n`)
                      │
                      └─ On complete/error: res.end(), cleanup store after 5s
```

---

## Frontend Components

### TTSFast.tsx (Main Page)

Responsibilities:
- Text input with character count
- TTS readiness check on mount (calls `tts-status`)
- Setup prompt if models not downloaded (calls `tts-setup`)
- Triggers generation (calls `tts-fast-progress`)
- Manages `ttsId` state to show/hide `<TTSProgress>`
- On complete: fetches audio file, creates blob URL for playback
- Download button for generated audio

State flow:
```
idle → isProcessing=true → ttsId set → TTSProgress shown
  → onComplete: fetch audio, create blob URL, show player
  → onError: show toast, reset state
```

### TTSProgress.tsx (Progress Bar)

Props:
```typescript
{
  ttsId: string;
  onComplete: (data: { filePath?; filename?; downloadUrl?; duration? }) => void;
  onError: (error: string) => void;
}
```

Renders:
- Status label (e.g. "Loading model...", "Generating audio...")
- Percentage text
- Animated progress bar (CSS transition on width)
- Optional detail message

Safety:
- 3-minute timeout → fires `onError('Generation timeout')`
- Max 2 consecutive poll/SSE errors → fires `onError('Failed to get progress')`
- `closedRef` prevents callbacks after unmount

---

## Backend Handlers

### Electron (server-handlers.cjs)

| Handler              | Description                                      |
|----------------------|--------------------------------------------------|
| `tts-status`         | Check if runner exists and models are downloaded  |
| `tts-setup`          | Spawn `tts-runner.mjs --download` to fetch models |
| `tts-fast-progress`  | Create ttsId, start background task, return ttsId |
| `get-tts-progress`   | Read from `ttsProgressStore` and return           |
| `tts-fast`           | Synchronous TTS (no progress, blocks until done)  |

### Web (routes.ts)

| Endpoint                        | Method | Description                          |
|---------------------------------|--------|--------------------------------------|
| `GET /api/tts/status`           | GET    | Check TTS readiness                  |
| `POST /api/tts/setup`           | POST   | Download models                      |
| `POST /api/tts/fast/progress`   | POST   | Start TTS, return `tts_id`           |
| `GET /api/tts/progress/:ttsId`  | GET    | SSE stream of progress updates       |
| `POST /api/tts/fast`            | POST   | Synchronous TTS (no progress)        |
| `GET /api/files/:filename`      | GET    | Download generated WAV file          |

---

## Logging

### Backend Logging (server-handlers.cjs)

All TTS operations are logged with `[TTS Task]` prefix:

```
[TTS Task] ========== STARTING TTS TASK ==========
[TTS Task] TTS ID: tts_1738836000000
[TTS Task] Text length: 42
[TTS Task] Progress callback - stage: initializing, percent: 10
[TTS Task] Progress callback - stage: loading, percent: 30
[TTS Task] Progress callback - stage: generating, percent: 60
[TTS Task] Progress callback - stage: writing, percent: 80
[TTS Task] ========== PREPARING FINAL COMPLETE DATA ==========
[TTS Task] ========== TTS TASK COMPLETE ==========
```

On error:
```
[TTS Task] ========== TTS TASK FAILED ==========
[TTS Task] Error: <message>
[TTS Task] ========== ERROR HANDLING COMPLETE ==========
```

### TTS Runner Logging (tts-runner.mjs)

Writes to stderr with `[TTS Runner]` prefix:

```
[TTS Runner] Starting audio generation
[TTS Runner] Text length: 42
[TTS Runner] Pipeline loaded
[TTS Runner] Text processed, audio generated
[TTS Runner] Audio length: 60000 samples at 24000 Hz
[TTS Runner] Audio file written to: C:\...\tts_fast_1738836000000.wav
[TTS Runner] Generation complete: {"status":"success","duration":2.5,...}
```

### Frontend Logging (TTSFast.tsx + TTSProgress.tsx)

Console logs with `[TTS]` and `[TTSProgress]` prefixes:

```
[TTS] Starting generation...
[TTS] Mode: Electron
[TTS] Text length: 42
[TTS] Got TTS ID: tts_1738836000000
[TTSProgress] Starting progress tracking for: tts_1738836000000
[TTSProgress] Poll result: { status: 'generating', percent: 60 }
[TTSProgress] Generation complete!
[TTS] Generation complete! { filePath: '...', duration: 2.5 }
[TTS] Audio ready for playback
```

---

## Model Management (Ollama-style)

### First-time Setup Flow

```
User opens TTS page
  → tts-status check → { ready: false, ttsInstalled: false }
  → UI shows warning: "TTS models need to be downloaded"
  → User clicks "Download TTS Models"
  → tts-setup handler spawns: node tts-runner.mjs --download
  → Runner downloads model from HuggingFace to %APPDATA%/psi-ai-content-hub/vie-neu-tts/models/
  → Runner writes tts_ready.json marker file
  → UI re-checks status → { ready: true }
  → Generate button enabled
```

### File Layout

```
%APPDATA%/psi-ai-content-hub/vie-neu-tts/
  ├── models/           # @xenova/transformers cache (downloaded model files)
  └── tts_ready.json    # Marker file: { modelId, downloadedAt }
```

---

## Error Handling

| Scenario                  | Behavior                                                    |
|---------------------------|-------------------------------------------------------------|
| TTS not installed         | UI shows setup warning with download button                 |
| Runner file missing       | Error: "TTS runner is missing. Please reinstall the app."   |
| Model download fails      | Toast: "Setup Failed" with error message                    |
| Generation fails          | Progress shows error status, toast notification             |
| Poll/SSE connection lost  | After 2 errors, fires onError callback                      |
| Generation timeout        | After 3 minutes, fires onError('Generation timeout')        |
| Process crash (exit != 0) | stderr captured and returned as error message               |
