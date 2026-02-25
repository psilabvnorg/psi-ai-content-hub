from __future__ import annotations

import logging
from collections.abc import Callable, Sequence

from ..models import ImageResult
from .artvee import search_artvee_images
from .bing import search_bing_images
from .google import search_google_images
from .lexica import search_lexica_images
from .unsplash import search_unsplash_images


LOGGER = logging.getLogger(__name__)

SourceRunner = Callable[[], list[ImageResult]]

ALL_SOURCE_IDS: tuple[str, ...] = (
    "google",
    "bing",
    "unsplash",
    "lexica",
    "artvee",
)


def run_all_sources(
    query: str,
    per_source_limit: int = 5,
    timeout_seconds: int = 30,
    enabled_sources: Sequence[str] | None = None,
) -> tuple[list[ImageResult], dict[str, str]]:
    """Run all configured sources and merge unique URLs."""
    results: list[ImageResult] = []
    errors: dict[str, str] = {}
    seen_urls: set[str] = set()

    sources: tuple[tuple[str, SourceRunner], ...] = (
        ("google", lambda: search_google_images(query, per_source_limit, timeout_seconds)),
        ("bing", lambda: search_bing_images(query, per_source_limit, timeout_seconds)),
        ("unsplash", lambda: search_unsplash_images(query, per_source_limit, timeout_seconds)),
        ("lexica", lambda: search_lexica_images(query, per_source_limit, timeout_seconds)),
        ("artvee", lambda: search_artvee_images(query, per_source_limit, timeout_seconds)),
    )

    if enabled_sources is not None:
        enabled_set = set(enabled_sources)
        sources = tuple(source for source in sources if source[0] in enabled_set)

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

