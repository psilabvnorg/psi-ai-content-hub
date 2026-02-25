from __future__ import annotations

import logging

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_ARTVEE_SEARCH_URL = "https://artvee.com/main/"


def search_artvee_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Artvee and return artwork thumbnail images."""
    if max_results <= 0:
        return []

    LOGGER.warning("[Artvee] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    soup = fetch_page(
        _ARTVEE_SEARCH_URL,
        timeout_seconds=timeout_seconds,
        params={"s": query},
    )

    results: list[ImageResult] = []
    seen: set[str] = set()

    for top in soup.select("div.product-element-top"):
        if len(results) >= max_results:
            break

        img = top.select_one("img.lazy")
        if img is None:
            continue

        image_url = None
        for attr in ("src", "data-src", "data-lazy-src"):
            val = img.get(attr)
            if isinstance(val, str) and val.startswith("http"):
                image_url = val
                break
        if not image_url:
            continue

        if image_url in seen:
            continue

        seen.add(image_url)
        results.append(ImageResult(source="artvee", url=image_url))

    LOGGER.warning("[Artvee] Complete: returning %d results", len(results))
    return results
