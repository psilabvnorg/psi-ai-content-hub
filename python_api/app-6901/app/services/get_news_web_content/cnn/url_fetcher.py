"""Fetch article URLs from a CNN category page."""

import re

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://edition.cnn.com"
DEFAULT_CATEGORY_URL = f"{BASE_URL}/business"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_TIMEOUT = 15

# CNN article paths follow /{year}/{month}/{day}/{category}/{slug}
_ARTICLE_PATH_RE = re.compile(r"^/\d{4}/\d{2}/\d{2}/.+")


def fetch_article_urls(
    category_url: str = DEFAULT_CATEGORY_URL,
    limit: int = 20,
) -> list[str]:
    """Return up to *limit* unique article URLs from *category_url*.

    Only links whose path matches the CNN date-based article pattern
    ``/{year}/{month}/{day}/{category}/{slug}`` are collected.

    @param category_url: CNN category listing page (e.g. ``https://edition.cnn.com/business``).
    @param limit: Maximum number of URLs to return.
    @return: Deduplicated list of absolute article URLs.
    """
    resp = requests.get(category_url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    seen: set[str] = set()
    urls: list[str] = []

    # Primary: CNN article links use class "container__link"
    for anchor in soup.select("a.container__link[href]"):
        href: str = anchor.get("href", "")
        _collect(href, seen, urls, limit)
        if len(urls) >= limit:
            return urls

    # Fallback: scan all anchors for date-patterned hrefs
    if len(urls) < limit:
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"]
            _collect(href, seen, urls, limit)
            if len(urls) >= limit:
                break

    return urls


def _collect(href: str, seen: set[str], urls: list[str], limit: int) -> None:
    """Normalise *href* to a full URL and append to *urls* if it is a new article link."""
    # Accept relative paths or absolute URLs on the same domain
    if href.startswith("http"):
        if not href.startswith((BASE_URL, "https://www.cnn.com")):
            return
        path = href.split("cnn.com", 1)[-1]
    else:
        path = href

    if not _ARTICLE_PATH_RE.match(path):
        return

    full_url = BASE_URL + path if not href.startswith("http") else href
    # Normalise to edition subdomain
    full_url = full_url.replace("https://www.cnn.com", BASE_URL)

    if full_url not in seen:
        seen.add(full_url)
        urls.append(full_url)
