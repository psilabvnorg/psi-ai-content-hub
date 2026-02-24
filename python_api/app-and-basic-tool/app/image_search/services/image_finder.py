from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from .image_pipeline.orchestrator import run_pipeline
from ...services.llm import generate


class ImageFinderError(Exception):
    """Raised when image search generation fails."""


# Regex to strip <think>...</think> blocks produced by deepseek-r1 and similar.
_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _strip_think_tags(text: str) -> str:
    """Remove ``<think>...</think>`` reasoning blocks from LLM output."""
    return _THINK_TAG_RE.sub("", text).strip()


def _extract_visual_keywords(text: str, target_words: int, model: str) -> str:
    """
    Uses an LLM to generate a concise, descriptive search phrase from input text.

    @param text The input text (paragraph).
    @param target_words The approximate number of words for the search phrase.
    @param model The LLM to use for generation.
    @return A descriptive search phrase capturing the main visual elements and scene.
    """
    prompt = (
        "You are an image search keyword generator. Your ONLY job is to output a short descriptive phrase "
        "that can be used to find relevant images on Google Images.\n\n"
        "RULES:\n"
        "- ALWAYS output a search phrase, no matter what the input text is about.\n"
        "- Even if the text is about data, statistics, numbers, or abstract topics, "
        "find the most relevant visual subject (objects, people, places, products) and describe them.\n"
        "- NEVER refuse. NEVER say 'I cannot' or explain what you are doing.\n"
        "- Output ONLY the search phrase — no quotes, no explanation, no preamble.\n"
        f"- Aim for approximately {target_words} words.\n\n"
        "Examples:\n"
        '  Input: "Toyota Fortuner sales increased 15% in Q3 2024"\n'
        "  Output: Toyota Fortuner SUV showroom display modern design\n\n"
        '  Input: "The S&P 500 dropped 3% amid inflation fears"\n'
        "  Output: stock market trading floor screens financial data display\n\n"
        '  Input: "Population growth in urban areas reached 2.1% in 2024"\n'
        "  Output: aerial view modern city skyline dense urban buildings\n\n"
        "Now generate a search phrase for this text:"
    )
    raw_output = generate(prompt=prompt, input_text=text, model=model)
    search_phrase = _strip_think_tags(raw_output).strip().strip('"\'')

    if not search_phrase:
        raise ImageFinderError("Empty search phrase returned from LLM service")

    # If the LLM still refused despite the prompt, fall back to extracting
    # the most distinctive noun phrases from the original text.
    refusal_markers = ("i cannot", "i can't", "i'm unable", "as an ai", "i need information")
    if any(marker in search_phrase.lower() for marker in refusal_markers):
        # Use the first ~target_words words of the original text as a fallback
        words = text.split()[:target_words]
        search_phrase = " ".join(words)

    return search_phrase



def find_images(
    text: str,
    number_of_images: int = 5,
    target_words: int = 15,
    model: str = "deepseek-r1:8b",
    timeout_seconds: int = 60,
    sources: Sequence[str] | None = None,
    use_llm: bool = True,
) -> dict[str, Any]:
    """Generate image results from semantic text keywords using all configured sources."""
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ImageFinderError("text is required")

    normalized_count = max(1, min(20, int(number_of_images)))
    normalized_words = max(5, min(30, int(target_words)))

    word_count = len(cleaned_text.split())
    if not use_llm or word_count <= 30:
        keywords = cleaned_text
    else:
        keywords = _extract_visual_keywords(cleaned_text, target_words=normalized_words, model=model)
    search_query = keywords

    pipeline_payload = run_pipeline(
        paragraph=cleaned_text,
        query_generator=lambda _: search_query,
        per_source_limit=5,
        top_k=normalized_count,
        timeout_seconds=timeout_seconds,
        enabled_sources=sources,
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

