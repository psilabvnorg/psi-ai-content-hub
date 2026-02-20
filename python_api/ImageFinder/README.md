# ImageFinder

Finds relevant images for a given text paragraph using LLM keyword extraction and multi-source image search.

## Quick Start

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Server starts at **http://127.0.0.1:6907**.

## Prerequisites

- **Python 3.12+**
- **Ollama** running locally with a model pulled (e.g. `ollama pull deepseek-r1:8b`)
- **Google Chrome** installed (for Google Images search via headless browser)
- **Unsplash API key** (optional) — configure from the UI or via `PUT /api/v1/config/api-keys/unsplash`

## Project Structure

```
ImageFinder/
├── README.md
├── requirements.txt
├── venv/                          # Python virtual environment
└── app/
    ├── __init__.py
    ├── main.py                    # Uvicorn entry point (port 6907)
    ├── app.py                     # FastAPI app, registers all routers
    │
    ├── routers/                   # HTTP API layer
    │   ├── __init__.py
    │   ├── system.py              # GET  /api/v1/status        — health check
    │   ├── env.py                 # GET  /api/v1/env/status    — venv & dependency check
    │   ├── llm.py                 # GET  /api/v1/llm/status    — Ollama connection & models
    │   ├── config.py              # GET/PUT /api/v1/config/api-keys — API key management
    │   └── image_finder.py        # POST /api/v1/image-finder/search — main search endpoint
    │
    └── services/                  # Business logic
        ├── __init__.py
        ├── llm.py                 # Ollama client wrapper (generate text)
        ├── image_finder.py        # LLM prompt engineering, keyword extraction, refusal fallback
        │
        └── image_pipeline/        # Image search & processing pipeline
            ├── __init__.py
            ├── models.py          # Data models: SearchQuery, ImageResult
            ├── orchestrator.py    # Pipeline coordinator (search → download → analyze → select)
            │
            ├── search/            # Multi-source image search
            │   ├── __init__.py    # run_all_sources() — dispatches to all providers, deduplicates
            │   ├── google.py      # Google Images via headless Chrome (undetected_chromedriver)
            │   ├── bing.py        # Bing Images via HTTP scraping
            │   ├── duckduckgo.py  # DuckDuckGo via ddgs package (with retry/backoff)
            │   └── unsplash.py    # Unsplash REST API (optional, needs API key)
            │
            ├── downloader.py      # Parallel image download with validation
            ├── analyzer.py        # Resolution analysis using Pillow
            └── selector.py        # Top-K selection by resolution (min 600px side)
```

## Pipeline Flow

```
Input text (paragraph)
    │
    ▼
┌─────────────────────────────────────────────┐
│  LLM Keyword Extraction  (services/image_finder.py)         │
│  Ollama model generates visual search keywords              │
│  • <think> tag stripping for deepseek-r1                    │
│  • Refusal detection fallback                               │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Multi-Source Search  (search/__init__.py)                   │
│  Runs all sources sequentially, deduplicates URLs           │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐      │
│  │  Google   │ │  Bing    │ │ DuckDuckGo│ │ Unsplash │      │
│  │ (Chrome)  │ │ (HTTP)   │ │  (ddgs)   │ │  (API)   │      │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Parallel Download  (downloader.py)                          │
│  Downloads images to temp directory, validates format        │
│  Max 30 MB per file, up to 10 concurrent workers            │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Resolution Analysis  (analyzer.py)                          │
│  Opens each image with Pillow, reads width × height         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Top-K Selection  (selector.py)                              │
│  Filters out images < 600px on either side                  │
│  Sorts by resolution descending, returns top N              │
└─────────────────────────────────────────────┘
    │
    ▼
JSON response with images (url, source, file_path, dimensions)
```

## API Endpoints

| Method | Endpoint                          | Description                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/v1/image-finder/search`     | Main search — accepts text, returns images |
| GET    | `/api/v1/status`                  | Server health check                      |
| GET    | `/api/v1/env/status`              | Python env & installed dependencies      |
| GET    | `/api/v1/llm/status`              | Ollama connection & available models     |
| GET    | `/api/v1/config/api-keys`         | Check configured API keys (masked)       |
| PUT    | `/api/v1/config/api-keys/unsplash`| Set or remove Unsplash API key           |

### POST `/api/v1/image-finder/search`

**Request:**
```json
{
  "text": "Toyota Fortuner sales increased 15% in Q3 2024",
  "number_of_images": 5,
  "target_words": 15,
  "model": "deepseek-r1:8b",
  "lang": "en",
  "timeout_seconds": 60
}
```

**Response:**
```json
{
  "status": "ok",
  "keywords": "Toyota Fortuner SUV modern showroom",
  "search_query": "Toyota Fortuner SUV modern showroom latest",
  "count": 5,
  "images": [
    {
      "url": "https://example.com/fortuner.jpg",
      "source": "google",
      "file_path": "C:\\...\\image_finder\\google\\a1b2c3.jpg",
      "width": 1200,
      "height": 800,
      "resolution": 960000
    }
  ]
}
```

## Dependencies

See `requirements.txt`:

| Package                    | Purpose                                   |
|----------------------------|-------------------------------------------|
| `fastapi` + `uvicorn`     | HTTP server                               |
| `requests`                 | HTTP client (Bing, Unsplash, downloads)   |
| `selenium`                 | Browser automation for Google Images      |
| `undetected-chromedriver`  | Stealth Chrome driver (bypasses bot detection) |
| `ddgs`                     | DuckDuckGo image search API               |
| `pillow`                   | Image resolution analysis                 |
| `python-dotenv`            | Load `.env` file for API keys             |
| `setuptools`               | Required by Python 3.12+ (provides distutils) |
