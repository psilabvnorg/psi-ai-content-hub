from __future__ import annotations

import logging
import time
import random

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BASE_DELAY = 2.0  # seconds


def _extract_ddg_image_url(item: dict[str, object]) -> str:
    for key in ("image", "url", "thumbnail"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return ""


def _fetch_with_retry(query: str, max_results: int) -> list[dict[str, object]]:
    """Attempt DDG image search with exponential backoff on 403 errors."""
    try:
        from ddgs import DDGS
    except ImportError:
        LOGGER.warning("Package 'ddgs' not found. Install it with: pip install ddgs")
        return []

    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            ddgs = DDGS()
            return list(ddgs.images(query, safesearch="off", max_results=max_results))
        except Exception as exc:
            last_exc = exc
            exc_str = str(exc)
            # Only retry on 403 / rate-limit errors
            if "403" not in exc_str and "Forbidden" not in exc_str and "Ratelimit" not in exc_str:
                raise
            delay = _BASE_DELAY * (2 ** attempt) + random.uniform(0, 1)
            LOGGER.info("DuckDuckGo 403 on attempt %d/%d, retrying in %.1fs", attempt + 1, _MAX_RETRIES, delay)
            time.sleep(delay)

    if last_exc is not None:
        raise last_exc
    return []


def search_duckduckgo_images(query: str, max_results: int = 10) -> list[ImageResult]:
    results: list[ImageResult] = []
    seen: set[str] = set()

    try:
        raw_items = _fetch_with_retry(query, max_results)
        for item in raw_items:
            if len(results) >= max_results:
                break
            if not isinstance(item, dict):
                continue
            url = _extract_ddg_image_url(item)
            if not url.startswith("http") or url in seen:
                continue
            seen.add(url)
            results.append(ImageResult(source="duckduckgo", url=url))
    except Exception as exc:  # pragma: no cover - network/integration behavior
        LOGGER.warning("DuckDuckGo image search failed: %s", exc)
        return []

    return results[:max_results]

