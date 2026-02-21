from __future__ import annotations

from .models import ImageResult


def select_top_images(
    images: list[ImageResult],
    top_k: int = 5,
    min_side: int = 600,
) -> list[ImageResult]:
    """
    Sort by resolution descending and keep best N images.

    Small images are filtered out first; if nothing survives, fallback to all valid-resolution items.
    """
    if top_k <= 0:
        return []

    valid = [img for img in images if img.resolution is not None and img.width is not None and img.height is not None]
    filtered = [img for img in valid if img.width >= min_side and img.height >= min_side]
    ranking_pool = filtered if filtered else valid
    ranking_pool.sort(key=lambda item: item.resolution or 0, reverse=True)
    return ranking_pool[:top_k]

