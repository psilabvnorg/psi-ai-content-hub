from __future__ import annotations

import logging
from urllib.parse import quote, urljoin, urlparse

from ..models import ImageResult
from ._api_source import search_api_source
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
UNSPLASH_SEARCH_API = "https://api.unsplash.com/search/photos"
_UNSPLASH_SCRAPE_BASE = "https://unsplash.com/s/photos"
_DISALLOWED_TOKENS = ("avatar", "profile", "logo", ".svg")


def _extract_unsplash_urls(payload: dict[str, object]) -> list[str]:
    rows = payload.get("results")
    if not isinstance(rows, list):
        return []

    results: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        raw_urls = row.get("urls")
        if not isinstance(raw_urls, dict):
            continue
        for key in ("full", "regular", "raw"):
            value = raw_urls.get(key)
            if isinstance(value, str) and value.startswith("http"):
                results.append(value)
                break
    return results


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
    """Search Unsplash via API (preferred) or scrape fallback."""
    if max_results <= 0:
        return []

    from ...credentials import get_credential

    LOGGER.warning("[Unsplash] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    api_key = get_credential("UNSPLASH_ACCESS_KEY")

    if api_key:
        try:
            urls = search_api_source(
                url=UNSPLASH_SEARCH_API,
                params={"query": query, "page": 1, "per_page": max(1, min(30, max_results))},
                headers={"Authorization": f"Client-ID {api_key}"},
                extract_fn=_extract_unsplash_urls,
                max_results=max_results,
                timeout_seconds=timeout_seconds,
            )
            if urls:
                LOGGER.warning("[Unsplash] Complete: returning %d results (API)", len(urls))
                return [ImageResult(source="unsplash", url=url) for url in urls]
        except Exception as exc:
            LOGGER.warning("[Unsplash] API failed (%s), falling back to scrape", exc)
    else:
        LOGGER.warning("[Unsplash] API key missing (UNSPLASH_ACCESS_KEY), using scrape fallback")

    results = _scrape_unsplash_images(query, max_results, timeout_seconds)
    LOGGER.warning("[Unsplash] Complete: returning %d results (scrape fallback)", len(results))
    return results

