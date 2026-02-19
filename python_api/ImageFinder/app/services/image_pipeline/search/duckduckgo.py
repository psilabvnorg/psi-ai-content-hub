from __future__ import annotations

import logging

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)


def _extract_ddg_image_url(item: dict[str, object]) -> str:
    for key in ("image", "url", "thumbnail"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return ""


def search_duckduckgo_images(query: str, limit: int = 5) -> list[ImageResult]:
    """Search images using duckduckgo_search library."""
    if limit <= 0:
        return []

    results: list[ImageResult] = []
    seen: set[str] = set()

    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            for item in ddgs.images(query, safesearch="off", max_results=max(10, limit * 3)):
                if len(results) >= limit:
                    break
                url = _extract_ddg_image_url(item)
                if not url.startswith("http") or url in seen:
                    continue
                seen.add(url)
                results.append(ImageResult(source="duckduckgo", url=url))
    except Exception as exc:  # pragma: no cover - network/integration behavior
        LOGGER.warning("DuckDuckGo image search failed: %s", exc)
        return []

    return results[:limit]

