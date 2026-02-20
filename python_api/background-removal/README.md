# Background Removal API

Runs on **port 6905**. Removes image backgrounds using the `ZhengPeng7/BiRefNet` model (runs locally, no internet needed after the first download).

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Run (port 6905)
python -m app.main
```

---

## Model Storage

| Path | Purpose |
|------|---------|
| `C:\Users\ADMIN\AppData\Roaming\psi-ai-content-hub\models\birefnet\` | BiRefNet model weights (HuggingFace cache format) |
| System temp (`psi_ai_content_hub\`) | Processed PNG output files (retained 1 hour) |

---

## Service Status Table

The UI shows a three-row status table that drives the entire setup workflow. Each row is independent and has its own action button(s).

```
┌──────────────────┬───────────┬──────────────────────────────────────────────┐
│ Tool             │ Status    │ Path / Info                                  │
├──────────────────┼───────────┼──────────────────────────────────────────────┤
│ Server Status    │ Ready / ✗ │ http://127.0.0.1:6905   [Stop Server]        │
│ Environment      │ Ready / ✗ │ installed modules list  [Install Library]    │
│ Model Status     │ Ready / ✗ │ ZhengPeng7/BiRefNet • cpu  [Download Model]  │
│                  │           │                            [Load Model]       │
│                  │           │                            [Unload Model]     │
└──────────────────┴───────────┴──────────────────────────────────────────────┘
```

---

### Row 1 — Server Status

**What it tracks:** whether the FastAPI process on port 6905 is reachable.

**How it works:**
- On page load, the frontend calls `GET /api/v1/status` and `GET /api/v1/env/status` in parallel.
- If either call fails (network error / timeout), `serverUnreachable = true` → all three rows show "Not Ready" and action buttons are hidden.
- The Electron main process manages the server lifecycle via `ManagedService:bgremove`.

**Start Server flow:**
1. User clicks **Start Server**.
2. Electron spawns `python -m app.main` inside the `venv`.
3. `serviceStatus.status` changes to `"running"` → frontend re-fetches status automatically.

**Stop Server flow:**
1. User clicks **Stop Server**.
2. Electron kills the Python process.
3. `serverUnreachable` becomes `true` → all rows go red.

**Status polling:** the frontend does NOT continuously poll the server. It re-fetches on:
- Page mount
- `serviceStatus.status` changes (`"running"` or `"stopped"`)
- After any action (install, download, load, unload)

---

### Row 2 — Environment Status

**What it tracks:** whether all required Python packages are installed in the service `venv`.

**Packages checked** (`GET /api/v1/env/status`):

| Module import name | pip package |
|--------------------|-------------|
| `fastapi` | `fastapi` |
| `uvicorn` | `uvicorn` |
| `multipart` | `python-multipart` |
| `torch` | `torch` |
| `torchvision` | `torchvision` |
| `PIL` | `pillow` |
| `numpy` | `numpy` |
| `timm` | `timm` |
| `kornia` | `kornia` |
| `skimage` | `scikit-image` |
| `huggingface_hub` | `huggingface_hub` |
| `transformers` | `transformers>=4.39.1` |
| `einops` | `einops` |

The endpoint uses `importlib.util.find_spec()` on each module name. If any are missing, `installed: false` is returned and the **Install Library** button appears.

**Install Library flow:**
1. User clicks **Install Library**.
2. Frontend `POST /api/v1/env/install` → server starts `pip install -U <missing packages>` as a subprocess inside the `venv`.
3. Server returns `{ task_id }`.
4. Frontend opens an `EventSource` to `GET /api/v1/env/install/stream/{task_id}` and receives `{ status, percent, logs[] }` events every 500 ms.
5. Progress bar and log output update live in the UI.
6. On `status: "complete"` → stream closes, `fetchStatus()` re-runs to confirm all modules now pass.
7. UI shows: **"Dependencies installed. Restart the server to load the model."** — a server restart is required because the running Python process does not automatically see newly installed packages.

---

### Row 3 — Model Status

**What it tracks:** two separate states:
- `model_downloaded` — whether model weight files exist on disk in `models/birefnet/`
- `model_loaded` — whether the model is loaded into CPU/GPU memory and ready to infer

These are reported by `GET /api/v1/status` → `models.background_removal`:

```json
{
  "model_id": "ZhengPeng7/BiRefNet",
  "model_loaded": false,
  "model_loading": false,
  "model_error": null,
  "model_downloaded": false,
  "model_downloading": false,
  "model_download_error": null,
  "device": "cpu"
}
```

The button shown changes based on state:

| `model_downloaded` | `model_loaded` | Button shown |
|--------------------|----------------|--------------|
| `false` | `false` | **Download Model** |
| `true` | `false` | **Load Model** |
| `true` | `true` | **Unload Model** |

Buttons are disabled (labeled **Starting...**) while any operation is in progress.

---

#### Download Model flow

Downloads the model weight files from HuggingFace Hub to disk. Does **not** load into memory.

1. User clicks **Download Model**.
2. Frontend `POST /api/v1/remove/download`.
3. Backend:
   - Checks `_is_model_on_disk()` — if files already exist, returns `{ task_id: null }` (no-op).
   - Sets `_model_downloading = true`.
   - Generates a `task_id` (prefix `bgdownload_`), sets initial progress in `ProgressStore`.
   - Launches a background thread that calls `huggingface_hub.snapshot_download(MODEL_ID, cache_dir=MODEL_BIREFNET_DIR)`.
   - A parallel ticker thread increments progress from 5% → 90% every 4 seconds (fake progress, since `snapshot_download` does not expose per-file callbacks).
   - On completion: sets `_model_downloading = false`, writes `status: "complete"` to `ProgressStore`.
4. Frontend opens `EventSource` to `GET /api/v1/remove/stream/{task_id}` and receives progress events every 300 ms.
5. On `status: "complete"` → stream closes, `fetchStatus()` runs → row shows **Load Model** button.

**Disk structure after download:**
```
models/birefnet/
  models--ZhengPeng7--BiRefNet/
    blobs/          ← actual weight files (binary)
    refs/           ← branch → commit hash mapping
    snapshots/
      {commit_hash}/
        config.json
        BiRefNet_config.py
        pytorch_model.bin (or safetensors shards)
        ...
```

`_is_model_on_disk()` checks that `snapshots/` exists and is non-empty.

---

#### Load Model flow

Loads the already-downloaded model files into CPU/GPU memory.

1. User clicks **Load Model**.
2. Frontend `POST /api/v1/remove/load`.
3. Backend:
   - Checks `_model_loading` and `_model is not None` — if already loaded/loading, returns `{ task_id: null }`.
   - Generates a `task_id` (prefix `bgload_`), sets initial progress.
   - Launches a background thread that calls `_ensure_model_loaded(task_id)`.
4. Inside `_ensure_model_loaded`:
   - Acquires `_model_lock`, sets `_model_loading = true`.
   - Sets progress to 10% / "Downloading model files..." in `ProgressStore`.
   - Starts a ticker thread: increments progress 3% every 4 seconds (10% → 90%), while `from_pretrained` is running.
   - Calls `AutoModelForImageSegmentation.from_pretrained(MODEL_ID, trust_remote_code=True, cache_dir=MODEL_BIREFNET_DIR)` — loads from the local cache (no re-download if files exist).
   - Calls `.to(device)` and `.eval()`.
   - Sets `_model = loaded_model`, `_model_loading = false`.
   - Sets progress to 100% / `status: "complete"`.
5. Frontend stream closes on `complete`, `fetchStatus()` runs → row shows **Unload Model** button, "Remove Background" button activates.

**Device selection:** `"cuda"` if `torch.cuda.is_available()`, otherwise `"cpu"`.

---

#### Unload Model flow

Frees the model from memory. Weight files remain on disk, so next time only **Load Model** is needed (no re-download).

1. User clicks **Unload Model**.
2. Frontend `POST /api/v1/remove/unload`.
3. Backend sets `_model = None`. If CUDA, calls `torch.cuda.empty_cache()`.
4. `fetchStatus()` runs → `model_loaded: false`, `model_downloaded: true` → row shows **Load Model**.

---

#### Progress Tracking — Technical Detail

All async operations (install, download, load, inference) use a shared `ProgressStore`:

```
ProgressStore
  ._progress: { task_id → { status, percent, message, updated } }
  ._logs:     { task_id → [log lines] }
```

**SSE stream** (`GET /api/v1/remove/stream/{task_id}`):
- Polls `ProgressStore.get_payload(task_id)` every 300 ms.
- Sends `data: { status, percent, message, logs }` events.
- Terminates when `status` is `"complete"`, `"error"`, or `"failed"`.

**Frontend** (`EventSource`):
- Updates `progress` state on each message → `ProgressDisplay` component re-renders bar + message.
- `logs` array is **replaced** (not appended) on each event to avoid duplicates.
- On `"complete"` or `"error"`: closes the `EventSource`, re-runs `fetchStatus()`.

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/status` | Server + model status |
| `GET` | `/api/v1/env/status` | Dependency check |
| `POST` | `/api/v1/env/install` | Install missing packages |
| `GET` | `/api/v1/env/install/stream/{task_id}` | SSE stream for install progress |
| `POST` | `/api/v1/remove/download` | Download model files to disk |
| `POST` | `/api/v1/remove/load` | Load model into memory |
| `POST` | `/api/v1/remove/unload` | Unload model from memory |
| `POST` | `/api/v1/remove/upload` | Remove background from uploaded image |
| `POST` | `/api/v1/remove/url` | Remove background from image URL |
| `GET` | `/api/v1/remove/stream/{task_id}` | SSE stream for task progress |
| `GET` | `/api/v1/remove/result/{task_id}` | Fetch final result |
| `GET` | `/api/v1/files/{file_id}` | Download a result file |

---

## Background Removal Processing Flow

Once the model is loaded, submitting an image follows this flow:

```
User submits image
       ↓
POST /api/v1/remove/upload  (or /url)
       ↓
task_id returned immediately
       ↓
Frontend opens SSE stream  ──────────────────────────────────────┐
       ↓                                                          │
Background thread:                                               SSE events
  5%  → Preparing image (decode bytes, convert to RGB)           │
  10% → Ensure model loaded                                       │
  45% → Run inference (resize 1024×1024 → BiRefNet → alpha mask) │
  80% → Save original + processed PNGs to temp dir               │
 100% → "complete"  ─────────────────────────────────────────────┘
       ↓
Frontend fetches GET /api/v1/remove/result/{task_id}
       ↓
Shows before/after slider + Download PNG button
```

Results are retained for **1 hour**, then auto-deleted by a background cleanup thread that runs every 60 seconds.
