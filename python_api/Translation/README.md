# Translation API

Runs on **port 6906**. Translates text between 8 languages using the `facebook/nllb-200-1.3B` model (runs locally, no internet needed after download).

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Run (port 6906)
python -m app.main
```

---

## How It Works

### Frontend (`client/src/pages/tools/Translator.tsx`)

The UI is a single React page. Here's what happens step by step:

1. **On load** — checks if the API server is reachable, then fetches model status (downloaded? loaded? which device?).
2. **User picks** source language, target language, and whether to preserve emotion, then types text.
3. **Click Translate** — sends a POST to `/api/v1/translation/translate` with the text and language pair.
4. **Backend returns a `job_id`** immediately (translation runs in the background).
5. **Frontend opens an SSE stream** (`EventSource`) to `/api/v1/translation/translate/stream/{job_id}` and listens for progress events (percent + message).
6. **When the stream signals `complete`**, the frontend fetches the final result from `/api/v1/translation/translate/result/{job_id}` and shows the translated text.
7. **Copy button** copies the output to clipboard.

Other controls:
- **Unload Model** button — frees GPU/CPU memory when you're done.
- **Status table** — shows server reachability, installed dependencies, and model state.

---

### Backend (`app/`)

#### API Routes (`app/routers/translation.py`)

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/api/v1/translation/translate` | Start a translation job, returns `{ job_id }` |
| `GET` | `/api/v1/translation/translate/stream/{job_id}` | SSE stream of progress updates |
| `GET` | `/api/v1/translation/translate/result/{job_id}` | Fetch final result when done |
| `POST` | `/api/v1/translation/download` | Download the NLLB model from HuggingFace |
| `GET` | `/api/v1/translation/status` | Model status (loaded, downloaded, device) |
| `POST` | `/api/v1/translation/unload` | Unload model from memory |

Model is managed in this location only C:\Users\ADMIN\AppData\Roaming\psi-ai-content-hub\models\

#### Translation Service (`app/services/translation.py`)

**Model:** `facebook/nllb-200-1.3B` — loaded once into memory and reused for all requests.

**Supported languages:**

| Code | Language |
|------|----------|
| `vi` | Vietnamese |
| `en` | English |
| `zh` | Chinese |
| `ja` | Japanese |
| `ko` | Korean |
| `fr` | French |
| `es` | Spanish |
| `de` | German |

**Translation flow:**

1. `start_translation()` creates a job and launches a background thread.
2. The thread detects whether CUDA (GPU) or CPU is available and loads the model accordingly.
3. **Simple text mode** — translates the whole text in one pass.
4. **Segment mode** — translates each segment individually; uses the previous and next segment as context to improve accuracy.
5. Each step reports progress via `ProgressStore` → streamed to the frontend as SSE events.
6. Result is saved in `JobStore` and returned when the frontend polls `/result/{job_id}`.

**Device selection:** prefers CUDA (GPU, `float16`) when available, falls back to CPU (`float32`).

**Model is lazy-loaded** — only downloaded/loaded the first time a translation is requested or the download button is clicked.
