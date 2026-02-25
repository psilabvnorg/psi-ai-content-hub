from __future__ import annotations

import logging
from urllib.parse import quote, urljoin, urlparse

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_UNSPLASH_SCRAPE_BASE = "https://unsplash.com/s/photos"
_DISALLOWED_TOKENS = ("avatar", "profile", "logo", ".svg")


def _select_srcset_candidate(raw_srcset: object) -> str:
    if not isinstance(raw_srcset, str):
        return ""
    parts = [part.strip() for part in raw_srcset.split(",") if part.strip()]
    if not parts:
        return ""
    return parts[-1].split()[0].strip()


def _normalize_unsplash_url(raw_url: object) -> str:
    if not isinstance(raw_url, str):
        return ""
    candidate = raw_url.strip()
    if not candidate:
        return ""
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"
    normalized = urljoin("https://unsplash.com/", candidate)
    parsed = urlparse(normalized)
    if "images.unsplash.com" not in parsed.netloc.lower():
        return ""
    lowered = normalized.lower()
    if any(token in lowered for token in _DISALLOWED_TOKENS):
        return ""
    return normalized


def _scrape_unsplash_images(
    query: str,
    max_results: int,
    timeout_seconds: int,
) -> list[ImageResult]:
    encoded_query = quote(query.strip(), safe="")
    url = f"{_UNSPLASH_SCRAPE_BASE}/{encoded_query}" if encoded_query else _UNSPLASH_SCRAPE_BASE
    soup = fetch_page(url, timeout_seconds=timeout_seconds)

    results: list[ImageResult] = []
    seen: set[str] = set()

    for image in soup.select("img[src], img[data-src], img[srcset]"):
        if len(results) >= max_results:
            break
        candidates = [
            image.get("src"),
            image.get("data-src"),
            _select_srcset_candidate(image.get("srcset")),
        ]
        for candidate in candidates:
            normalized = _normalize_unsplash_url(candidate)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            results.append(ImageResult(source="unsplash", url=normalized))
            break

    return results


def search_unsplash_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Unsplash via scrape."""
    if max_results <= 0:
        return []

    LOGGER.warning("[Unsplash] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    results = _scrape_unsplash_images(query, max_results, timeout_seconds)
    LOGGER.warning("[Unsplash] Complete: returning %d results", len(results))
    return results

