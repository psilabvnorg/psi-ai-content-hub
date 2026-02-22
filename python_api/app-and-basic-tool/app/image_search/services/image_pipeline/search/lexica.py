from __future__ import annotations

import logging

from ..models import ImageResult
from ._api_source import search_api_source
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_LEXICA_API_URL = "https://lexica.art/api/v1/search"
_LEXICA_SCRAPE_URL = "https://lexica.art/"


def _extract_lexica_urls(payload: dict[str, object]) -> list[str]:
    """Extract image URLs from Lexica API JSON response."""
    images = payload.get("images")
    if not isinstance(images, list):
        return []

    results: list[str] = []
    for item in images:
        if not isinstance(item, dict):
            continue
        for key in ("src", "srcSmall"):
            value = item.get(key)
            if isinstance(value, str) and value.startswith("http"):
                results.append(value)
                break
    return results


def _scrape_lexica_images(
    query: str,
    max_results: int,
    timeout_seconds: int,
) -> list[ImageResult]:
    """Fallback: scrape Lexica search page when API is unavailable."""
    LOGGER.warning("[Lexica] Using scrape fallback")
    soup = fetch_page(
        _LEXICA_SCRAPE_URL,
        timeout_seconds=timeout_seconds,
        params={"q": query},
    )

    results: list[ImageResult] = []
    seen: set[str] = set()

    for img in soup.select("img[src]"):
        if len(results) >= max_results:
            break
        src = img.get("src") or img.get("data-src") or ""
        if not isinstance(src, str) or not src.startswith("http"):
            continue
        # Lexica image CDN patterns
        if "lexica.art" not in src and "image.lexica.art" not in src:
            continue
        if src in seen:
            continue
        seen.add(src)
        results.append(ImageResult(source="lexica", url=src))

    return results


def search_lexica_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Lexica via API (preferred) or scrape fallback.

    @param query The image search query string.
    @param max_results Maximum number of image results to return.
    @param timeout_seconds Timeout in seconds for requests.
    """
    if max_results <= 0:
        return []

    LOGGER.warning("[Lexica] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)

    # Lexica API is public, but may require a key for higher rate limits
    from ...credentials import get_credential
    api_key = get_credential("LEXICA_API_KEY")

    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        urls = search_api_source(
            url=_LEXICA_API_URL,
            params={"q": query},
            headers=headers,
            extract_fn=_extract_lexica_urls,
            max_results=max_results,
            timeout_seconds=timeout_seconds,
        )
        if urls:
            LOGGER.warning("[Lexica] Complete: returning %d results (API)", len(urls))
            return [ImageResult(source="lexica", url=url) for url in urls]
    except Exception as exc:
        LOGGER.warning("[Lexica] API failed (%s), falling back to scrape", exc)

    # Fallback to scrape
    results = _scrape_lexica_images(query, max_results, timeout_seconds)
    LOGGER.warning("[Lexica] Complete: returning %d results (scrape fallback)", len(results))
    return results
