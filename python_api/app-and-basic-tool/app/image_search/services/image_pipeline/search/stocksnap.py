from __future__ import annotations

import logging
import re
from urllib.parse import quote, urljoin, urlparse

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_STOCKSNAP_SEARCH_BASE = "https://stocksnap.io/search"
_IMAGE_EXT_RE = re.compile(r"\.(?:jpg|jpeg|png|webp)(?:\?.*)?$", re.IGNORECASE)
_DISALLOWED_TOKENS = ("logo", "avatar", "icon", "sprite", ".svg")


def _select_srcset_candidate(raw_srcset: object) -> str:
    if not isinstance(raw_srcset, str):
        return ""
    parts = [part.strip() for part in raw_srcset.split(",") if part.strip()]
    if not parts:
        return ""
    # Use the last srcset entry (highest width candidate in most HTML listings).
    return parts[-1].split()[0].strip()


def _normalize_stocksnap_image_url(raw_url: object) -> str:
    if not isinstance(raw_url, str):
        return ""
    candidate = raw_url.strip()
    if not candidate:
        return ""
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"

    normalized = urljoin("https://stocksnap.io/", candidate)
    parsed = urlparse(normalized)
    host = parsed.netloc.lower()
    if host not in {"stocksnap.io", "cdn.stocksnap.io"}:
        return ""
    if not _IMAGE_EXT_RE.search(parsed.path):
        return ""
    lowered = normalized.lower()
    if any(token in lowered for token in _DISALLOWED_TOKENS):
        return ""
    return normalized


def search_stocksnap_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search StockSnap and scrape image URLs from result markup."""
    if max_results <= 0:
        return []

    LOGGER.warning("[StockSnap] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
    encoded_query = quote(query.strip(), safe="")
    search_url = f"{_STOCKSNAP_SEARCH_BASE}/{encoded_query}" if encoded_query else _STOCKSNAP_SEARCH_BASE
    soup = fetch_page(search_url, timeout_seconds=timeout_seconds)

    results: list[ImageResult] = []
    seen: set[str] = set()

    for element in soup.select("img[src], img[data-src], img[srcset], source[srcset]"):
        if len(results) >= max_results:
            break
        candidates = [
            element.get("src"),
            element.get("data-src"),
            _select_srcset_candidate(element.get("srcset")),
        ]
        for candidate in candidates:
            image_url = _normalize_stocksnap_image_url(candidate)
            if not image_url or image_url in seen:
                continue
            seen.add(image_url)
            results.append(ImageResult(source="stocksnap", url=image_url))
            break

    LOGGER.warning("[StockSnap] Complete: returning %d results", len(results))
    return results
