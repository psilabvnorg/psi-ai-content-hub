from __future__ import annotations

import html
import json
import logging
import re
from urllib.parse import quote_plus

import requests

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)

_BING_IMAGE_SEARCH_URL = "https://www.bing.com/images/search"
_BING_URL_PATTERNS = (
    re.compile(r'"murl":"(.*?)"'),
    re.compile(r"murl&quot;:&quot;(.*?)&quot;"),
)
_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}


def _decode_bing_url(encoded_url: str) -> str:
    candidate = encoded_url.strip()
    if not candidate:
        return ""

    try:
        candidate = json.loads(f'"{candidate}"')
    except json.JSONDecodeError:
        candidate = candidate.replace("\\/", "/")

    return candidate.strip()


def _extract_image_urls(page_html: str, max_results: int) -> list[str]:
    results: list[str] = []
    seen: set[str] = set()

    for pattern in _BING_URL_PATTERNS:
        for match in pattern.findall(page_html):
            if len(results) >= max_results:
                return results

            decoded_url = _decode_bing_url(match)
            if not decoded_url.startswith("http") or decoded_url in seen:
                continue

            seen.add(decoded_url)
            results.append(decoded_url)

    return results


def search_bing_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Bing Images and return candidate image URLs.

    @param query The image search query string.
    @param max_results Maximum number of image results to return.
    @param timeout_seconds Timeout in seconds for HTTP requests.
    """
    if max_results <= 0:
        return []

    search_url = f"{_BING_IMAGE_SEARCH_URL}?q={quote_plus(query)}&form=HDRSC2"
    LOGGER.warning("[BingSearch] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)

    try:
        response = requests.get(
            search_url,
            headers=_REQUEST_HEADERS,
            timeout=timeout_seconds,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        LOGGER.warning("[BingSearch] Failed: %s", exc)
        return []

    raw_html = html.unescape(response.text)
    urls = _extract_image_urls(raw_html, max_results)
    LOGGER.warning("[BingSearch] Complete: returning %d results (html_size=%d)", len(urls), len(raw_html))
    return [ImageResult(source="bing", url=url) for url in urls]
