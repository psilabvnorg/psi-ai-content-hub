from __future__ import annotations

import logging

from ..models import ImageResult
from ._api_source import search_api_source
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_PEXELS_API_URL = "https://api.pexels.com/v1/search"
_PEXELS_SCRAPE_URL = "https://www.pexels.com/search"


def _extract_pexels_urls(payload: dict[str, object]) -> list[str]:
    """Extract image URLs from Pexels API JSON response."""
    photos = payload.get("photos")
    if not isinstance(photos, list):
        return []

    results: list[str] = []
    for photo in photos:
        if not isinstance(photo, dict):
            continue
        src = photo.get("src")
        if not isinstance(src, dict):
            continue
        for key in ("original", "large2x", "large"):
            value = src.get(key)
            if isinstance(value, str) and value.startswith("http"):
                results.append(value)
                break
    return results


def _scrape_pexels_images(
    query: str,
    max_results: int,
    timeout_seconds: int,
) -> list[ImageResult]:
    """Fallback: scrape Pexels search page when API key is unavailable."""
    LOGGER.warning("[Pexels] Using scrape fallback")
    soup = fetch_page(
        _PEXELS_SCRAPE_URL,
        timeout_seconds=timeout_seconds,
        params={"query": query},
    )

    results: list[ImageResult] = []
    seen: set[str] = set()

    for img in soup.select("img[src]"):
        if len(results) >= max_results:
            break
        src = img.get("src") or img.get("data-src") or ""
        if not isinstance(src, str) or not src.startswith("http"):
            continue
        if "images.pexels.com/photos" not in src:
            continue
        if src in seen:
            continue
        seen.add(src)
        results.append(ImageResult(source="pexels", url=src))

    return results


def search_pexels_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Pexels via API (preferred) or scrape fallback.

    @param query The image search query string.
    @param max_results Maximum number of image results to return.
    @param timeout_seconds Timeout in seconds for requests.
    """
    if max_results <= 0:
        return []

    LOGGER.warning("[Pexels] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)

    from ...credentials import get_credential
    api_key = get_credential("PEXELS_API_KEY")

    if not api_key:
        LOGGER.warning("[Pexels] API key missing (PEXELS_API_KEY), falling back to scrape")
        results = _scrape_pexels_images(query, max_results, timeout_seconds)
        LOGGER.warning("[Pexels] Complete: returning %d results (scrape)", len(results))
        return results

    urls = search_api_source(
        url=_PEXELS_API_URL,
        params={
            "query": query,
            "per_page": max(1, min(80, max_results)),
        },
        headers={"Authorization": api_key},
        extract_fn=_extract_pexels_urls,
        max_results=max_results,
        timeout_seconds=timeout_seconds,
    )

    LOGGER.warning("[Pexels] Complete: returning %d results (API)", len(urls))
    return [ImageResult(source="pexels", url=url) for url in urls]
