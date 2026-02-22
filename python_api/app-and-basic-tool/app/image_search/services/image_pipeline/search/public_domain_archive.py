from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse

from ..models import ImageResult
from ._scrape_source import fetch_page


LOGGER = logging.getLogger(__name__)
_PDA_SEARCH_URL = "https://publicdomainarchive.com/"
_IMAGE_EXT_RE = re.compile(r"\.(?:jpg|jpeg|png|webp)(?:\?.*)?$", re.IGNORECASE)
_LISTING_PATHS = {
    "/",
    "/index.html",
    "/public-domain-images.html",
    "/free-stock-photos.html",
}


def _is_detail_page_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "publicdomainarchive.com" not in host:
        return False

    path = parsed.path.lower() or "/"
    if path in _LISTING_PATHS:
        return False
    if not path.endswith(".html"):
        return False
    if path.startswith(("/category/", "/tag/", "/author/", "/page/", "/feed/", "/wp-")):
        return False
    return True


def _normalize_image_url(candidate: object, base_url: str) -> str:
    if not isinstance(candidate, str):
        return ""
    raw = candidate.strip()
    if not raw:
        return ""
    if raw.startswith("//"):
        raw = f"https:{raw}"

    normalized = urljoin(base_url, raw)
    parsed = urlparse(normalized)
    if "publicdomainarchive.com" not in parsed.netloc.lower():
        return ""
    if not _IMAGE_EXT_RE.search(parsed.path):
        return ""
    return normalized


def _extract_detail_image_url(detail_url: str, timeout_seconds: int) -> str:
    detail_soup = fetch_page(detail_url, timeout_seconds=timeout_seconds)

    meta_tag = detail_soup.select_one("meta[property='og:image'][content]")
    if meta_tag is not None:
        url = _normalize_image_url(meta_tag.get("content"), detail_url)
        if url:
            return url

    image = detail_soup.select_one("div.entry-content img[src]")
    if image is not None:
        url = _normalize_image_url(image.get("src"), detail_url)
        if url:
            return url

    return ""


def search_public_domain_archive_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Public Domain Archive and resolve post pages to image URLs."""
    if max_results <= 0:
        return []

    LOGGER.warning(
        "[PublicDomainArchive] Starting: query=%r, max_results=%d, timeout=%ds",
        query,
        max_results,
        timeout_seconds,
    )

    soup = fetch_page(
        _PDA_SEARCH_URL,
        timeout_seconds=timeout_seconds,
        params={"s": query},
    )

    detail_urls: list[str] = []
    seen_detail_urls: set[str] = set()

    for link in soup.select("a[href]"):
        href = link.get("href")
        if not isinstance(href, str):
            continue
        detail_url = urljoin(_PDA_SEARCH_URL, href)
        if not _is_detail_page_url(detail_url):
            continue
        if detail_url in seen_detail_urls:
            continue
        seen_detail_urls.add(detail_url)
        detail_urls.append(detail_url)
        if len(detail_urls) >= max_results * 3:
            break

    results: list[ImageResult] = []
    seen_images: set[str] = set()
    for detail_url in detail_urls:
        if len(results) >= max_results:
            break
        try:
            image_url = _extract_detail_image_url(detail_url, timeout_seconds=timeout_seconds)
        except Exception as exc:
            LOGGER.warning("[PublicDomainArchive] Skipping detail page %s: %s", detail_url, exc)
            continue
        if not image_url or image_url in seen_images:
            continue
        seen_images.add(image_url)
        results.append(ImageResult(source="public_domain_archive", url=image_url))

    LOGGER.warning("[PublicDomainArchive] Complete: returning %d results", len(results))
    return results
