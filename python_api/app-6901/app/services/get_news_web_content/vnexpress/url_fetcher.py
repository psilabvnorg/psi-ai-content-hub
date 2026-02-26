"""Fetch article URLs from a VNExpress category page."""

import requests
from bs4 import BeautifulSoup

DEFAULT_CATEGORY_URL = "https://vnexpress.net/kinh-doanh"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
}

REQUEST_TIMEOUT = 15


def fetch_article_urls(
    category_url: str = DEFAULT_CATEGORY_URL,
    limit: int = 20,
) -> list[str]:
    """Return up to *limit* unique article URLs from *category_url*.

    Only links that point to ``https://vnexpress.net/…*.html`` are collected.

    @param category_url: VNExpress category listing page.
    @param limit: Maximum number of URLs to return.
    @return: Deduplicated list of article URLs.
    """
    resp = requests.get(category_url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    urls: list[str] = []
    for anchor in soup.select("a[href]"):
        href = anchor["href"]
        if (
            href.startswith("https://vnexpress.net/")
            and href.endswith(".html")
            and href not in urls
        ):
            urls.append(href)
            if len(urls) >= limit:
                break

    return urls
