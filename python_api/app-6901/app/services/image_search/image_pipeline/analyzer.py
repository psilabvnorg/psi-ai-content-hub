from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace

from .models import ImageResult


LOGGER = logging.getLogger(__name__)


def analyze_resolution(image: ImageResult) -> ImageResult:
    """
    Read image dimensions and computed pixel resolution.

    @return Updated ImageResult with width/height/resolution or error.
    """
    if not image.file_path:
        return replace(image, error="Missing file_path")

    try:
        from PIL import Image
        with Image.open(image.file_path) as loaded:
            width, height = loaded.size
        resolution = int(width) * int(height)
        return replace(image, width=int(width), height=int(height), resolution=resolution, error=None)
    except Exception as exc:
        return replace(image, error=f"Failed to analyze image: {exc}")


def analyze_images(images: list[ImageResult], max_workers: int = 8) -> tuple[list[ImageResult], list[str]]:
    if not images:
        return [], []

    analyzed: list[ImageResult] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=max(1, max_workers)) as executor:
        futures = {executor.submit(analyze_resolution, image): image for image in images}
        for future in as_completed(futures):
            original = futures[future]
            try:
                result = future.result()
                analyzed.append(result)
                if result.error:
                    errors.append(f"{result.url}: {result.error}")
            except Exception as exc:  # pragma: no cover - defensive integration guard
                message = f"Analyzer failed for {original.url}: {exc}"
                LOGGER.warning(message)
                errors.append(message)

    return analyzed, errors

