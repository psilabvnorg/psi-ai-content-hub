from __future__ import annotations

import logging
from typing import Callable

from .analyzer import analyze_images
from .downloader import download_images
from .models import SearchQuery
from .search import run_all_sources
from .selector import select_top_images


LOGGER = logging.getLogger(__name__)


def run_pipeline(
    paragraph: str,
    query_generator: Callable[[str], str],
    per_source_limit: int = 5,
    top_k: int = 5,
    timeout_seconds: int = 30,
) -> dict[str, object]:
    """
    Run full image pipeline: query -> search -> download -> resolution analysis -> top-k selection.
    """
    query = query_generator(paragraph).strip()
    if not query:
        raise RuntimeError("Query generator returned empty search query")

    search_query = SearchQuery(paragraph=paragraph, query=query)

    url_candidates, search_errors = run_all_sources(
        query=search_query.query,
        per_source_limit=per_source_limit,
        timeout_seconds=timeout_seconds,
    )

    downloaded_images, download_errors = download_images(
        url_candidates,
        timeout_seconds=timeout_seconds,
        max_workers=10,
    )

    analyzed_images, analysis_errors = analyze_images(downloaded_images, max_workers=10)
    selected_images = select_top_images(analyzed_images, top_k=top_k, min_side=600)

    if search_errors:
        LOGGER.warning("Image pipeline source errors: %s", search_errors)
    if download_errors:
        LOGGER.warning("Image pipeline download errors: %s", download_errors[:5])
    if analysis_errors:
        LOGGER.warning("Image pipeline analysis errors: %s", analysis_errors[:5])

    return {
        "query": search_query.query,
        "images": [image.to_dict() for image in selected_images],
        "summary": {
            "search_candidates": len(url_candidates),
            "downloaded": len(downloaded_images),
            "analyzed": len(analyzed_images),
            "selected": len(selected_images),
            "search_errors": search_errors,
            "download_errors": download_errors,
            "analysis_errors": analysis_errors,
        },
    }

