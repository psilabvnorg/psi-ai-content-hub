from __future__ import annotations

import logging

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_LEXICA_SCRAPE_URL = "https://lexica.art/"


def search_lexica_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Lexica by scraping the search page.

    @param query The image search query string.
    @param max_results Maximum number of image results to return.
    @param timeout_seconds Timeout in seconds for requests.
    """
    if max_results <= 0:
        return []

    import json as _json
    import re as _re

    LOGGER.warning("[Lexica] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)

    soup = fetch_page(
        _LEXICA_SCRAPE_URL,
        timeout_seconds=timeout_seconds,
        params={"q": query},
    )

    # Regex to extract the JSON-string argument from __next_f.push([1, "..."])
    _push_re = _re.compile(
        r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)',
        _re.DOTALL,
    )
    # Matches image objects: {"id":"<uuid>","promptid":"  (not prompt objects)
    _img_id_re = _re.compile(
        r'"id":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})","promptid":'
    )

    image_ids: list[str] = []
    seen: set[str] = set()

    for script in soup.find_all("script"):
        text = script.string or ""
        if "__next_f.push" not in text or "initialPrompts" not in text:
            continue
        for push_match in _push_re.finditer(text):
            try:
                decoded: str = _json.loads(push_match.group(1))
            except Exception:
                continue
            if "initialPrompts" not in decoded:
                continue
            for m in _img_id_re.finditer(decoded):
                img_id = m.group(1)
                if img_id not in seen:
                    seen.add(img_id)
                    image_ids.append(img_id)
                    if len(image_ids) >= max_results:
                        break
            if len(image_ids) >= max_results:
                break

    results = [
        ImageResult(source="lexica", url=f"https://image.lexica.art/full_jpg/{img_id}")
        for img_id in image_ids
    ]
    LOGGER.warning("[Lexica] Complete: returning %d results", len(results))
    return results
