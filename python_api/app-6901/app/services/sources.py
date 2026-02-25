from __future__ import annotations

from .image_search.image_pipeline.orchestrator import run_pipeline
from .image_search.image_pipeline.search import ALL_SOURCE_IDS


SOURCE_CATALOG: list[dict[str, str | bool]] = [
    {"id": "google", "name": "Google Images", "category": "general", "requires_key": False},
    {"id": "bing", "name": "Bing Images", "category": "general", "requires_key": False},
    {"id": "unsplash", "name": "Unsplash", "category": "api_key", "requires_key": True},
    {"id": "lexica", "name": "Lexica", "category": "ai", "requires_key": True},
    {"id": "artvee", "name": "Artvee", "category": "art", "requires_key": False},
]

VALID_SOURCES: set[str] = set(ALL_SOURCE_IDS)


def list_sources() -> dict:
    return {"sources": SOURCE_CATALOG}


def search_source(
    source_id: str,
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> dict:
    """Run a single-source image search.

    Raises:
        ValueError: if source_id is not in VALID_SOURCES.
        Exception: propagates any pipeline errors to the caller.
    """
    if source_id not in VALID_SOURCES:
        raise ValueError(f"Unknown source: {source_id}")

    result = run_pipeline(
        paragraph=query,
        query_generator=lambda _: query,
        per_source_limit=max_results,
        top_k=max_results,
        timeout_seconds=timeout_seconds,
        enabled_sources=[source_id],
    )
    images = result.get("images")
    normalized_images = images if isinstance(images, list) else []
    return {
        "status": "ok",
        "source": source_id,
        "query": query,
        "count": len(normalized_images),
        "images": normalized_images,
        "summary": result.get("summary"),
    }
