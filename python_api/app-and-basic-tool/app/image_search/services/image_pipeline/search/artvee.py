from __future__ import annotations

import logging
from urllib.parse import urljoin

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_ARTVEE_SEARCH_URL = "https://artvee.com/"


def _extract_image_url_from_detail(detail_url: str, timeout_seconds: int) -> str:
    detail_soup = fetch_page(detail_url, timeout_seconds=timeout_seconds)
    image = detail_soup.select_one("img.wp-post-image")
    if image is None:
        return ""

    for attr in ("src", "data-src", "data-lazy-src"):
        value = image.get(attr)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return ""


def search_artvee_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Artvee and resolve product pages to full artwork images."""
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

    links = soup.select("a.product-image-link")
    for link in links:
        if len(results) >= max_results:
            break
        href = link.get("href")
        if not isinstance(href, str):
            continue

        detail_url = urljoin(_ARTVEE_SEARCH_URL, href)
        image_url = _extract_image_url_from_detail(detail_url, timeout_seconds=timeout_seconds)
        if not image_url or image_url in seen:
            continue

        seen.add(image_url)
        results.append(ImageResult(source="artvee", url=image_url))

    LOGGER.warning("[Artvee] Complete: returning %d results", len(results))
    return results
