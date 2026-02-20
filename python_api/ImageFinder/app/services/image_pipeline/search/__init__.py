from __future__ import annotations

import logging

from ..models import ImageResult
from .bing import search_bing_images
from .duckduckgo import search_duckduckgo_images
from .google import search_google_images
from .unsplash import search_unsplash_images


LOGGER = logging.getLogger(__name__)


def run_all_sources(
    query: str,
    per_source_limit: int = 5,
    timeout_seconds: int = 30,
) -> tuple[list[ImageResult], dict[str, str]]:
    """Run all configured sources and merge unique URLs."""
    results: list[ImageResult] = []
    errors: dict[str, str] = {}
    seen_urls: set[str] = set()

    sources = (
        ("google", lambda: search_google_images(query, per_source_limit, timeout_seconds)),
        ("bing", lambda: search_bing_images(query, per_source_limit, timeout_seconds)),
        ("duckduckgo", lambda: search_duckduckgo_images(query, per_source_limit)),
        ("unsplash", lambda: search_unsplash_images(query, per_source_limit, timeout_seconds)),
    )

    for source_name, run_source in sources:
        try:
            source_results = run_source()
        except Exception as exc:  # pragma: no cover - integration behavior
            LOGGER.warning("Image source failed (%s): %s", source_name, exc)
            errors[source_name] = str(exc)
            continue

        for item in source_results:
            normalized = item.url.strip()
            if not normalized or normalized in seen_urls:
                continue
            seen_urls.add(normalized)
            results.append(item)

    return results, errors

