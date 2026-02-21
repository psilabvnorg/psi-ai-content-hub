from __future__ import annotations

import logging
import re
from urllib.parse import urljoin

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_WGA_SEARCH_URL = "https://www.wga.hu/cgi-bin/search.cgi"
_WGA_ART_PATH_RE = re.compile(r"/art/[^\"'\s>]+\.(?:jpg|jpeg|png|webp)", re.IGNORECASE)


def search_wga_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Web Gallery of Art and extract artwork image paths."""
    if max_results <= 0:
        return []

    LOGGER.warning("[WGA] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    soup = fetch_page(
        _WGA_SEARCH_URL,
        timeout_seconds=timeout_seconds,
        params={
            "Author": "",
            "Title": query,
            "Form": "painting",
            "Type": "all",
            "action": "Search",
        },
    )

    results: list[ImageResult] = []
    seen: set[str] = set()

    for image in soup.find_all("img"):
        if len(results) >= max_results:
            break

        src = image.get("src")
        if not isinstance(src, str):
            continue

        match = _WGA_ART_PATH_RE.search(src)
        if not match:
            continue

        url = urljoin("https://www.wga.hu", match.group(0))
        if url in seen:
            continue

        seen.add(url)
        results.append(ImageResult(source="wga", url=url))

    LOGGER.warning("[WGA] Complete: returning %d results", len(results))
    return results
