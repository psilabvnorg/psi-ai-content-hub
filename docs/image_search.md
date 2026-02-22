# Image Source Strategy

| Website               | Type     | Primary                        | Fallback |
| --------------------- | -------- | ------------------------------ | -------- |
| Unsplash              | API      | API (API key)                  | scrape   |
| Pexels                | API      | API (API key)                  | scrape   |
| Lexica                | API      | API (API key)                  | scrape   |
| Public Domain Archive | Scrape   | scrape                         | none     |
| StockSnap             | Scrape   | scrape                         | none     |
| Artvee                | Scrape   | scrape (keep current)          | none     |
| Web Gallery of Art    | Scrape   | scrape (keep current)          | none     |
| Google Images         | Selenium | selenium (keep current)        | none     |
| KlingAI               | Selenium | selenium (keep current)        | none     |
| Bing                  | HTTP     | direct request (keep current)  | none     |
| Civitai               | HTTP     | API (keep current)             | none     |

---

## API Endpoints

### List available sources

```
GET /sources
```

**Response:**

```json
{
  "sources": [
    {"id": "pexels", "name": "Pexels", "category": "stock", "requires_key": true},
    ...
  ]
}
```

### Search & download from a specific source

```
POST /sources/{source_id}/search
```

**Request body:**

```json
{
  "query": "sunset landscape",
  "max_results": 10,
  "timeout_seconds": 30
}
```

**Response:**

```json
{
  "status": "ok",
  "source": "pexels",
  "query": "sunset landscape",
  "count": 5,
  "images": [
    {
      "source": "pexels",
      "url": "https://images.pexels.com/photos/...",
      "file_path": "/tmp/psi_ai_content_hub/image_finder/pexels/abc123.jpg",
      "width": 1920,
      "height": 1080,
      "resolution": 2073600,
      "error": null
    }
  ],
  "summary": { "total": 5, "downloaded": 5, "errors": [] }
}
```

**Pipeline:** `search source → download images (parallel) → analyze (PIL) → select top-K by resolution`

> **Future improvement:** Replace resolution-based selection with CLIP relevance ranking — see [Image Selection: CLIP Relevance Ranking](#future-improvement--clip-relevance-ranking) below.

Each `source_id` must match an entry in `ALL_SOURCE_IDS`. The endpoint runs the full pipeline (search → download → analyze → select) scoped to that single source.

---

## Plan: Image Source Implementation Tasks

Based on research of the current codebase, here's what exists vs. what's needed:

- **Already implemented (7 sources):** Google, Bing, Unsplash (API only), Civitai, KlingAI, Artvee, WGA
- **Implemented in this plan (4 new + 1 enhancement):**

---

### High-Level Checklist

#### Task 1 — Pexels (API source + scrape fallback)

- [x] Create `search/pexels.py` — API-based using `_api_source.search_api_source()` helper
- [x] API endpoint: `https://api.pexels.com/v1/search` — requires `PEXELS_API_KEY` env var
- [x] Extract URLs from `photos[].src.original` / `photos[].src.large2x`
- [x] Add scrape fallback: if API key missing, scrape `pexels.com/search/photos/{query}` using `_scrape_source.fetch_page()`
- [x] Register in `search/__init__.py` → enables `POST /sources/pexels/search`
- [x] Register in `routers/sources.py` `SOURCE_CATALOG` → exposes in `GET /sources`

#### Task 2 — Lexica (API source + scrape fallback)

- [x] Create `search/lexica.py` — API-based using `_api_source.search_api_source()` helper
- [x] API endpoint: `https://lexica.art/api/v1/search?q={query}` — public, may need key for higher limits
- [x] Extract URLs from `images[].src` or `images[].srcSmall`
- [x] Add scrape fallback: scrape `lexica.art/?q={query}` if API unavailable
- [x] Register in `search/__init__.py` → enables `POST /sources/lexica/search`
- [x] Register in `routers/sources.py` `SOURCE_CATALOG` → exposes in `GET /sources`

#### Task 3 — Public Domain Archive (scrape only)

- [x] Create `search/public_domain_archive.py` — scrape using `_scrape_source.fetch_page()`
- [x] Target URL: `https://www.publicdomainarchive.com/?s={query}` (or equivalent search endpoint)
- [x] Extract image URLs from gallery listing HTML
- [x] Register in `search/__init__.py` → enables `POST /sources/public_domain_archive/search`
- [x] Register in `routers/sources.py` `SOURCE_CATALOG` → exposes in `GET /sources`

#### Task 4 — StockSnap (scrape only)

- [x] Create `search/stocksnap.py` — scrape using `_scrape_source.fetch_page()`
- [x] Target URL: `https://stocksnap.io/search/{query}`
- [x] Extract image URLs from `img` tags in search results
- [x] Register in `search/__init__.py` → enables `POST /sources/stocksnap/search`
- [x] Register in `routers/sources.py` `SOURCE_CATALOG` → exposes in `GET /sources`

#### Task 5 — Unsplash scrape fallback

- [x] Enhance existing `search/unsplash.py` — add scrape fallback when `UNSPLASH_ACCESS_KEY` is missing
- [x] Scrape `unsplash.com/s/photos/{query}` using `_scrape_source.fetch_page()`
- [x] Extract image URLs from `<img>` tags (`data-src` attributes)

#### Task 6 — Cross-cutting

- [x] Update `SOURCE_CATALOG` in `routers/sources.py` with all 4 new entries
- [x] Update `ALL_SOURCE_IDS` and `run_all_sources()` in `search/__init__.py`
- [x] Add `.env.example` entries for `PEXELS_API_KEY`, `LEXICA_API_KEY`
- [x] Update `strategy.md` with implementation status

#### Task 7 — Verify per-source API download

Each new source must work via `POST /sources/{source_id}/search` (search → download → analyze → select):

- [ ] `POST /sources/pexels/search` — returns downloaded images with `file_path`
- [ ] `POST /sources/lexica/search` — returns downloaded images with `file_path`
- [ ] `POST /sources/public_domain_archive/search` — returns downloaded images with `file_path`
- [ ] `POST /sources/stocksnap/search` — returns downloaded images with `file_path`
- [ ] `POST /sources/unsplash/search` — verify scrape fallback works when key is missing

---

### Registration pattern (same for each new source)

Each source touches **3 files**:

1. `search/{source_name}.py` — the source module (function signature: `search_{name}_images(query, max_results=10, timeout_seconds=30) -> list[ImageResult]`)
2. `search/__init__.py` — add import + `ALL_SOURCE_IDS` entry + lambda in `run_all_sources()`
3. `routers/sources.py` — add `SOURCE_CATALOG` entry

---

### Implementation notes

- **Logging:** Every source must log at search **start** and **complete** for debugging, following the pattern in `google.py`:
  ```python
  LOGGER.warning("[SourceName] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
  # ... search logic ...
  LOGGER.warning("[SourceName] Complete: returning %d results", len(results))
  ```

---

## Future Improvement — CLIP Relevance Ranking

> **Status: NOT YET IMPLEMENTED** — This is a planned improvement for a later phase.
> Current selection uses **top-K by resolution**. This section documents the design for when we switch to relevance-based ranking.

### Problem

Selecting images by resolution alone ignores whether the image matches the user's search intent. A high-resolution irrelevant image is worse than a lower-resolution relevant one.

### Solution: CLIP-based Semantic Scoring

Use OpenAI's [CLIP](https://github.com/openai/CLIP) model to compute a **cosine similarity** between the search query text and each downloaded image. Rank by relevance, use resolution as tiebreaker.

### Updated pipeline (future)

```
search source
  → download images (parallel)
  → analyze dimensions (PIL)
  → score relevance (CLIP: query ↔ image embedding)
  → rank by relevance_score desc, resolution desc as tiebreaker
  → select top-K
```

### Scoring approaches

| Approach | Dependency | Speed | Accuracy | When to use |
| -------- | ---------- | ----- | -------- | ----------- |
| **CLIP** (`openai/clip-vit-base-patch32`) | `torch` + `transformers` (~2 GB) | ~50ms/img (GPU), ~200ms/img (CPU) | High | GPU available |
| **Keyword fallback** | None | <1ms/img | Low | No torch, lightweight deploy |

### CLIP scoring (pseudocode)

```python
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

def score_relevance(query: str, image_path: str) -> float:
    """Return 0.0–1.0 relevance score between query and image."""
    image = Image.open(image_path).convert("RGB")
    inputs = processor(text=[query], images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
    score = outputs.logits_per_image.item()
    return max(0.0, min(1.0, score / 100.0))
```

### Keyword fallback (pseudocode)

```python
def score_relevance_lightweight(query: str, url: str, alt_text: str = "") -> float:
    """Fallback: keyword overlap scoring."""
    keywords = set(query.lower().split())
    target = (url + " " + alt_text).lower()
    if not keywords:
        return 0.0
    return sum(1 for kw in keywords if kw in target) / len(keywords)
```

### Implementation plan (when ready)

- [ ] Add `relevance_score: float = 0.0` field to `ImageResult` in `models.py`
- [ ] Create `services/image_pipeline/relevance.py` — auto-detect CLIP vs keyword fallback
- [ ] Update `orchestrator.py` to call scoring after download+analyze
- [ ] Replace `sort by resolution` with `sort by (relevance_score, resolution)`
- [ ] Add `transformers`, `torch` (optional) to `requirements.txt`
- [ ] Cache CLIP model as module-level singleton
- [ ] Add unit tests for both scoring paths
