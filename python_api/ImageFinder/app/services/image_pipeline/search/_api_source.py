from __future__ import annotations

from typing import Callable
from urllib.parse import urlparse

import requests


_DEFAULT_API_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}


def search_api_source(
    url: str,
    params: dict[str, str | int | bool],
    headers: dict[str, str],
    extract_fn: Callable[[dict[str, object]], list[str]],
    max_results: int,
    timeout_seconds: int,
) -> list[str]:
    """GET a JSON endpoint and return deduplicated image URLs."""
    if max_results <= 0:
        return []

    parsed = urlparse(url)
    referer = f"{parsed.scheme}://{parsed.netloc}/"
    merged_headers = {**_DEFAULT_API_HEADERS, "Referer": referer}
    if headers:
        merged_headers.update(headers)

    response = requests.get(
        url,
        params=params,
        headers=merged_headers,
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    payload_raw = response.json()
    payload = payload_raw if isinstance(payload_raw, dict) else {}
    candidates = extract_fn(payload)

    results: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = candidate.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        results.append(normalized)
        if len(results) >= max_results:
            break

    return results
