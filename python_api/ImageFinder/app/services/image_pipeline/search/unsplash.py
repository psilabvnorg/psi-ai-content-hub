from __future__ import annotations

import logging
import os

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)
UNSPLASH_SEARCH_API = "https://api.unsplash.com/search/photos"


def _extract_unsplash_url(item: dict[str, object]) -> str:
    raw_urls = item.get("urls")
    if not isinstance(raw_urls, dict):
        return ""
    for key in ("full", "regular", "raw"):
        value = raw_urls.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return ""


def search_unsplash_images(
    query: str,
    limit: int = 5,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Unsplash with public API key and return full image URLs."""
    if limit <= 0:
        return []

    import requests
    from dotenv import load_dotenv
    load_dotenv()
    api_key = (os.getenv("UNSPLASH_ACCESS_KEY") or "").strip()
    if not api_key:
        LOGGER.warning("Unsplash API key is missing (UNSPLASH_ACCESS_KEY)")
        return []

    response = requests.get(
        UNSPLASH_SEARCH_API,
        params={"query": query, "page": 1, "per_page": max(1, min(30, limit))},
        headers={"Authorization": f"Client-ID {api_key}"},
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    payload = response.json()
    rows = payload.get("results")
    if not isinstance(rows, list):
        return []

    results: list[ImageResult] = []
    for row in rows:
        if len(results) >= limit:
            break
        if not isinstance(row, dict):
            continue
        url = _extract_unsplash_url(row)
        if not url:
            continue
        results.append(ImageResult(source="unsplash", url=url))

    return results

