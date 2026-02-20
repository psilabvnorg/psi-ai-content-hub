from __future__ import annotations

import logging

from ..models import ImageResult
from ._api_source import search_api_source


LOGGER = logging.getLogger(__name__)
_CIVITAI_IMAGES_API = "https://civitai.com/api/v1/images"


def _extract_civitai_urls(payload: dict[str, object]) -> list[str]:
    items = payload.get("items")
    if not isinstance(items, list):
        return []

    results: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if isinstance(url, str) and url.startswith("http"):
            results.append(url)
    return results


def search_civitai_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Civitai public images API."""
    if max_results <= 0:
        return []

    LOGGER.warning("[Civitai] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    urls = search_api_source(
        url=_CIVITAI_IMAGES_API,
        params={
            "query": query,
            "limit": max(1, min(200, max_results)),
            "nsfw": "false",
        },
        headers={},
        extract_fn=_extract_civitai_urls,
        max_results=max_results,
        timeout_seconds=timeout_seconds,
    )
    LOGGER.warning("[Civitai] Complete: returning %d results", len(urls))
    return [ImageResult(source="civitai", url=url) for url in urls]
