from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import quote_plus

import requests

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


def _extract_bing_urls(html_text: str, limit: int) -> list[str]:
    patterns = [
        r'"murl":"(.*?)"',
        r"murl&quot;:&quot;(.*?)&quot;",
    ]
    results: list[str] = []
    seen: set[str] = set()

    for pattern in patterns:
        for raw_url in re.findall(pattern, html_text):
            normalized = html.unescape(raw_url).replace("\\/", "/")
            if not normalized.startswith("http://") and not normalized.startswith("https://"):
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            results.append(normalized)
            if len(results) >= limit:
                return results
    return results


def _search_bing_image_urls(query: str, limit: int, timeout_seconds: int) -> list[str]:
    if limit <= 0:
        return []

    encoded_query = quote_plus(query)
    url = f"https://www.bing.com/images/search?q={encoded_query}&form=HDRSC2&first=1&tsc=ImageBasicHover"
    response = requests.get(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    return _extract_bing_urls(response.text, limit=limit)


def find_images(
    text: str,
    number_of_images: int = 5,
    target_words: int = 15,
    model: str = "deepseek-r1:8b",
    lang: str = "en",
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    """Generate a Bing image set from semantic text keywords."""
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ImageFinderError("text is required")

    normalized_count = max(1, min(20, int(number_of_images)))
    normalized_words = max(5, min(30, int(target_words)))
    keywords = _extract_visual_keywords(cleaned_text, target_words=normalized_words, model=model)

    phrase_by_lang = {
        "en": "latest, up to date information",
        "vi": "thong tin moi nhat",
        "ja": "saishin joho",
        "de": "aktuelle informationen",
    }
    suffix = phrase_by_lang.get(lang.lower(), phrase_by_lang["en"])
    search_query = f"{keywords} {suffix}".strip()

    image_urls = _search_bing_image_urls(
        query=search_query,
        limit=normalized_count,
        timeout_seconds=timeout_seconds,
    )

    return {
        "keywords": keywords,
        "search_query": search_query,
        "count": len(image_urls),
        "images": [
            {
                "url": image_url,
                "source": "bing",
                "description": search_query,
                "tags": [keywords],
            }
            for image_url in image_urls
        ],
    }
