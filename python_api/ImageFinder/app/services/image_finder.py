from __future__ import annotations

from typing import Any

from .image_pipeline.orchestrator import run_pipeline
from .llm import generate


class ImageFinderError(Exception):
    """Raised when image search generation fails."""


def _extract_visual_keywords(text: str, target_words: int, model: str) -> str:
    """
    Uses an LLM to generate a concise, descriptive search phrase from input text.

    @param text The input text (paragraph).
    @param target_words The approximate number of words for the search phrase.
    @param model The LLM to use for generation.
    @return A descriptive search phrase capturing the main visual elements and scene.
    """
    prompt = (
        "Based on the following text, generate a short, descriptive phrase for an image search. "
        "The phrase should capture the main visual elements and the overall scene. "
        f"Aim for approximately {target_words} words. Do not add any explanation or quotation marks."
    )
    search_phrase = generate(prompt=prompt, input_text=text, model=model).strip()
    if not search_phrase:
        raise ImageFinderError("Empty search phrase returned from LLM service")
    return search_phrase


def _build_search_query(text: str, target_words: int, model: str, lang: str) -> tuple[str, str]:
    keywords = _extract_visual_keywords(text, target_words=target_words, model=model)
    phrase_by_lang = {
        "en": "latest, up to date information",
        "vi": "thong tin moi nhat",
        "ja": "saishin joho",
        "de": "aktuelle informationen",
    }
    suffix = phrase_by_lang.get(lang.lower(), phrase_by_lang["en"])
    search_query = f"{keywords} {suffix}".strip()
    return keywords, search_query


def find_images(
    text: str,
    number_of_images: int = 5,
    target_words: int = 15,
    model: str = "deepseek-r1:8b",
    lang: str = "en",
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    """Generate image results from semantic text keywords using all configured sources."""
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ImageFinderError("text is required")

    normalized_count = max(1, min(20, int(number_of_images)))
    normalized_words = max(5, min(30, int(target_words)))
    keywords, search_query = _build_search_query(cleaned_text, normalized_words, model, lang)

    pipeline_payload = run_pipeline(
        paragraph=cleaned_text,
        query_generator=lambda _: search_query,
        per_source_limit=5,
        top_k=normalized_count,
        timeout_seconds=timeout_seconds,
    )
    images = pipeline_payload.get("images")
    if not isinstance(images, list):
        raise ImageFinderError("Invalid image pipeline payload")

    normalized_images: list[dict[str, Any]] = []
    for image in images:
        if not isinstance(image, dict):
            continue
        image_url = image.get("url")
        source = image.get("source")
        if not isinstance(image_url, str) or not image_url:
            continue
        normalized_images.append(
            {
                "url": image_url,
                "source": source if isinstance(source, str) else "unknown",
                "description": search_query,
                "tags": [keywords],
                "file_path": image.get("file_path"),
                "width": image.get("width"),
                "height": image.get("height"),
                "resolution": image.get("resolution"),
            }
        )

    return {
        "keywords": keywords,
        "search_query": search_query,
        "count": len(normalized_images),
        "images": normalized_images,
        "summary": pipeline_payload.get("summary"),
    }

