from __future__ import annotations

from urllib.parse import urlparse


_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


def fetch_page(
    url: str,
    timeout_seconds: int,
    params: dict[str, str | int | bool] | None = None,
):
    """GET HTML and return parsed BeautifulSoup."""
    import requests
    from bs4 import BeautifulSoup

    parsed = urlparse(url)
    referer = f"{parsed.scheme}://{parsed.netloc}/"
    headers = {**_BROWSER_HEADERS, "Referer": referer}

    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    return BeautifulSoup(response.text, "lxml")
