"""News web content scraper router.

Supported sources
-----------------
- vnexpress  (live)
- kenh14     (planned)
- cafef      (planned)
- cnn        (planned)

Endpoints
---------
GET  /api/v1/news-scraper/sources
POST /api/v1/news-scraper/fetch-urls
POST /api/v1/news-scraper/scrape
POST /api/v1/news-scraper/crawl/start
GET  /api/v1/news-scraper/crawl/stream/{job_id}
GET  /api/v1/news-scraper/crawl/result/{job_id}
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services.get_news_web_content.vnexpress import fetch_article_urls, scrape_article

router = APIRouter(prefix="/api/v1/news-scraper", tags=["news-scraper"])

_DEFAULT_OUT_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub" / "news_scraper"

# ---------------------------------------------------------------------------
# Source registry
# ---------------------------------------------------------------------------

SOURCES: list[dict[str, Any]] = [
    {
        "id": "vnexpress",
        "label": "VNExpress",
        "available": True,
        "default_category_url": "https://vnexpress.net/kinh-doanh",
        "categories": [
            {"label": "Kinh doanh", "url": "https://vnexpress.net/kinh-doanh"},
            {"label": "Thời sự", "url": "https://vnexpress.net/thoi-su"},
            {"label": "Thế giới", "url": "https://vnexpress.net/the-gioi"},
            {"label": "Khoa học", "url": "https://vnexpress.net/khoa-hoc"},
            {"label": "Giải trí", "url": "https://vnexpress.net/giai-tri"},
            {"label": "Thể thao", "url": "https://vnexpress.net/the-thao"},
            {"label": "Pháp luật", "url": "https://vnexpress.net/phap-luat"},
            {"label": "Giáo dục", "url": "https://vnexpress.net/giao-duc"},
            {"label": "Sức khỏe", "url": "https://vnexpress.net/suc-khoe"},
            {"label": "Du lịch", "url": "https://vnexpress.net/du-lich"},
        ],
    },
    {"id": "kenh14", "label": "Kênh 14", "available": False, "default_category_url": "https://kenh14.vn", "categories": []},
    {"id": "cafef", "label": "CafeF", "available": False, "default_category_url": "https://cafef.vn", "categories": []},
    {"id": "cnn", "label": "CNN", "available": False, "default_category_url": "https://edition.cnn.com", "categories": []},
]

_SOURCE_MAP = {s["id"]: s for s in SOURCES}


def _require_available_source(source: str) -> dict[str, Any]:
    info = _SOURCE_MAP.get(source)
    if not info:
        raise HTTPException(status_code=400, detail=f"Unknown source: '{source}'")
    if not info["available"]:
        raise HTTPException(status_code=400, detail=f"Source '{source}' is not yet supported")
    return info


# ---------------------------------------------------------------------------
# In-memory crawl job store
# ---------------------------------------------------------------------------

_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_event_queues: dict[str, queue.Queue] = {}


def _set_job(job_id: str, data: dict[str, Any]) -> None:
    with _jobs_lock:
        _jobs[job_id] = data


def _push_event(job_id: str, event: dict[str, Any] | None) -> None:
    q = _event_queues.get(job_id)
    if q is not None:
        q.put(event)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/sources")
def list_sources() -> dict:
    """Return all news sources, their category lists, and the default output directory."""
    return {"sources": SOURCES, "default_out_dir": str(_DEFAULT_OUT_DIR)}


@router.post("/fetch-urls")
def fetch_urls_route(payload: dict = Body(...)) -> dict:
    """Fetch article URLs from a news category page.

    Body fields:
    - ``source``       : news source id (default: ``vnexpress``)
    - ``category_url`` : category listing page URL
    - ``limit``        : max number of URLs to return (1–100, default 20)
    """
    source = str(payload.get("source") or "vnexpress").strip().lower()
    _require_available_source(source)

    default_url = str(_SOURCE_MAP[source]["default_category_url"])
    category_url = str(payload.get("category_url") or default_url).strip() or default_url

    limit = int(payload.get("limit") or 20)
    limit = max(1, min(limit, 100))

    try:
        urls = fetch_article_urls(category_url=category_url, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch URLs: {exc}") from exc

    return {"urls": urls, "count": len(urls), "source": source, "category_url": category_url}


@router.post("/scrape")
def scrape_single_route(payload: dict = Body(...)) -> dict:
    """Scrape a single article URL and return structured data.

    Body fields:
    - ``url`` : full article URL (required)
    """
    url = str(payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    tmp_dir = tempfile.mkdtemp(prefix="news_scrape_")
    try:
        json_path, _ = scrape_article(url=url, out_prefix="article", out_dir=tmp_dir)
        with open(json_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scrape failed: {exc}") from exc
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return data


# ---------------------------------------------------------------------------
# Batch crawl (background job with SSE progress)
# ---------------------------------------------------------------------------


def _run_crawl(
    job_id: str,
    source: str,
    category_url: str,
    limit: int,
    out_dir: str,
) -> None:
    """Worker thread: fetch URLs, scrape each article, stream progress via SSE."""
    try:
        _set_job(job_id, {"status": "running", "processed": 0, "failed": 0, "saved_files": []})
        _push_event(job_id, {"status": "started", "message": "Crawl started"})

        # Fetch candidate URLs
        fetch_limit = max(limit * 3, 50)
        urls = fetch_article_urls(category_url=category_url, limit=fetch_limit)
        to_scrape = urls[:limit]

        _push_event(
            job_id,
            {
                "status": "fetched",
                "message": f"Found {len(to_scrape)} articles to scrape",
                "total": len(to_scrape),
            },
        )

        os.makedirs(out_dir, exist_ok=True)

        processed = 0
        failed = 0
        saved_files: list[str] = []

        for idx, url in enumerate(to_scrape):
            prefix = f"article_{idx + 1}"
            _push_event(
                job_id,
                {
                    "status": "scraping",
                    "message": f"Scraping {idx + 1}/{len(to_scrape)}",
                    "current": idx + 1,
                    "total": len(to_scrape),
                    "percent": int((idx / len(to_scrape)) * 100),
                    "url": url,
                },
            )

            try:
                json_path, _ = scrape_article(url, prefix, out_dir)
                processed += 1
                saved_files.append(json_path)
            except Exception as exc:
                failed += 1
                _push_event(job_id, {"status": "article_failed", "url": url, "error": str(exc)})

            _set_job(
                job_id,
                {"status": "running", "processed": processed, "failed": failed, "saved_files": saved_files},
            )

            if idx < len(to_scrape) - 1:
                time.sleep(0.5)

        result: dict[str, Any] = {
            "status": "complete",
            "processed": processed,
            "failed": failed,
            "saved_files": saved_files,
            "out_dir": os.path.abspath(out_dir),
        }
        _set_job(job_id, result)
        _push_event(job_id, {**result, "percent": 100, "message": f"Done — {processed} articles saved"})

    except Exception as exc:
        err = str(exc)
        _set_job(job_id, {"status": "error", "error": err})
        _push_event(job_id, {"status": "error", "message": err})
    finally:
        _push_event(job_id, None)  # sentinel → close SSE stream


@router.post("/crawl/start")
def start_crawl(payload: dict = Body(...)) -> dict:
    """Start a background crawl job and return a job_id.

    Body fields:
    - ``source``       : news source id (default: ``vnexpress``)
    - ``category_url`` : category listing page URL
    - ``limit``        : articles to scrape (1–50, default 10)
    - ``out_dir``      : directory to write JSON output (default: ``articles``)
    """
    source = str(payload.get("source") or "vnexpress").strip().lower()
    _require_available_source(source)

    default_url = str(_SOURCE_MAP[source]["default_category_url"])
    category_url = str(payload.get("category_url") or default_url).strip() or default_url

    limit = int(payload.get("limit") or 10)
    limit = max(1, min(limit, 50))

    out_dir = str(payload.get("out_dir") or "").strip() or str(_DEFAULT_OUT_DIR)

    job_id = uuid.uuid4().hex
    _event_queues[job_id] = queue.Queue()

    thread = threading.Thread(
        target=_run_crawl,
        args=(job_id, source, category_url, limit, out_dir),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "source": source, "category_url": category_url, "limit": limit}


@router.get("/crawl/stream/{job_id}")
def crawl_stream(job_id: str) -> StreamingResponse:
    """SSE stream for crawl job progress events."""
    q = _event_queues.get(job_id)
    if q is None:
        raise HTTPException(status_code=404, detail="Job not found or stream already consumed")

    def _generate():
        while True:
            try:
                event = q.get(timeout=30)
            except queue.Empty:
                yield 'data: {"status":"heartbeat"}\n\n'
                continue

            if event is None:
                yield 'data: {"status":"done"}\n\n'
                break

            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.get("/crawl/result/{job_id}")
def crawl_result(job_id: str) -> dict:
    """Get the current state / final result of a crawl job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
