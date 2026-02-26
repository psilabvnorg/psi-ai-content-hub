"""Scrape and parse a single news article into structured data."""

from __future__ import annotations

import html as html_mod
import json
import os
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse
import urllib.robotparser as robotparser

import requests
from bs4 import BeautifulSoup, Tag

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

REQUEST_TIMEOUT = 15
SLEEP_BETWEEN_REQUESTS = 3.0
_MAX_RETRIES = 3

_FETCH_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_title(text: str | None) -> str | None:
    """Strip HTML entities and non-standard characters from a title."""
    if not text:
        return None
    text = html_mod.unescape(text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"&[a-zA-Z]+;", "", text)
    # Keep letters, digits, whitespace, and basic punctuation
    text = re.sub(r"[^\w\s.,!?:;()\-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def can_fetch(url: str, user_agent: str = USER_AGENT) -> bool:
    """Check *robots.txt* permission for *url*."""
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(user_agent, url)
    except Exception:
        return False


def _fetch_html(url: str) -> str:
    """Download *url* with retries and progressive back-off."""
    for attempt in range(_MAX_RETRIES):
        try:
            resp = requests.get(url, headers=_FETCH_HEADERS, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            if len(resp.text) < 100:
                raise ValueError(f"Response too short ({len(resp.text)} chars)")
            return resp.text
        except (requests.RequestException, ValueError) as exc:
            if attempt == _MAX_RETRIES - 1:
                raise RuntimeError(
                    f"Failed to fetch {url} after {_MAX_RETRIES} attempts"
                ) from exc
            time.sleep((attempt + 1) * 2)
    # Unreachable, but keeps mypy happy.
    raise RuntimeError("Unexpected fetch failure")


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def _extract_metadata(soup: BeautifulSoup, base_url: str) -> dict[str, Any]:
    """Pull Open-Graph / meta-tag metadata from the page."""

    def _meta(names: list[str]) -> str | None:
        for name in names:
            tag = soup.find("meta", attrs={"property": name}) or soup.find(
                "meta", attrs={"name": name}
            )
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    title_raw = _meta(["og:title", "twitter:title"]) or (
        soup.title.string.strip() if soup.title and soup.title.string else None
    )

    meta: dict[str, Any] = {
        "title": _clean_title(title_raw),
        "description": (_meta(["og:description", "description", "twitter:description"]) or "").strip() or None,
        "publisher": _meta(["article:publisher"]),
        "url": _meta(["og:url"]) or base_url,
        "image": _meta(["og:image", "twitter:image"]),
        "published_time": _meta(["article:published_time", "pubdate", "datePublished"]),
        "modified_time": _meta(["article:modified_time", "lastmod", "dateModified"]),
        "author": _meta(["author", "article:author"]),
    }

    # Tags
    meta["tags"] = [
        t["content"].strip()
        for t in soup.find_all("meta", attrs={"property": "article:tag"})
        if t.get("content")
    ]

    # Categories (from tt_list_folder_name, 3rd element)
    categories: list[str] = []
    for t in soup.find_all("meta", attrs={"name": "tt_list_folder_name"}):
        parts = [p.strip() for p in (t.get("content") or "").split(",") if p.strip()]
        if len(parts) >= 3:
            categories.append(parts[2])
    meta["categories"] = categories

    if meta["image"]:
        meta["image"] = urljoin(base_url, meta["image"])

    return meta


def _find_article_container(soup: BeautifulSoup) -> Tag:
    """Heuristically locate the main article container element."""
    candidates: list[Tag] = []

    for art in soup.find_all("article"):
        candidates.append(art)

    itemprop = soup.find(attrs={"itemprop": "articleBody"})
    if itemprop and isinstance(itemprop, Tag):
        candidates.append(itemprop)

    for cls in ("fck_detail", "fck_detail width_common", "container", "sidebar-1"):
        found = soup.find("div", class_=lambda c: c and cls in c)
        if found and isinstance(found, Tag):
            candidates.append(found)

    all_divs = soup.find_all("div")
    if all_divs:
        biggest = max(all_divs, key=lambda d: len(d.get_text(strip=True) or ""))
        candidates.append(biggest)

    best: Tag | None = None
    best_p_count = 0
    for cand in candidates:
        p_count = len(cand.find_all("p"))
        if p_count > best_p_count:
            best = cand
            best_p_count = p_count

    return best or soup.body or soup


def _extract_body(
    soup: BeautifulSoup, base_url: str
) -> dict[str, list[str] | list[dict[str, str | None]]]:
    """Extract paragraphs and images from the article body."""
    container = _find_article_container(soup)

    paragraphs = [
        p.get_text(separator=" ", strip=True)
        for p in container.find_all("p")
        if p.get_text(strip=True) and len(p.get_text(strip=True)) > 30
    ]

    seen_srcs: set[str] = set()
    images: list[dict[str, str | None]] = []
    for img in container.find_all("img"):
        src = img.get("data-src") or img.get("data-original") or img.get("src")
        if not src:
            continue
        src = urljoin(base_url, src)
        if src in seen_srcs:
            continue
        seen_srcs.add(src)

        caption: str | None = None
        fig = img.find_parent("figure")
        if fig:
            cap_tag = fig.find("figcaption")
            if cap_tag:
                caption = cap_tag.get_text(strip=True)
        if not caption and img.parent:
            cap_span = img.parent.find("span", class_=lambda c: c and "caption" in c)
            if cap_span:
                caption = cap_span.get_text(strip=True)

        images.append({"src": src, "caption": caption})

    return {"paragraphs": paragraphs, "images": images}


# ---------------------------------------------------------------------------
# Save helpers
# ---------------------------------------------------------------------------


def _save_json(data: dict[str, Any], path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def _save_html_preview(data: dict[str, Any], path: str) -> None:
    """Write a minimal HTML preview file (useful for quick review)."""
    meta = data.get("meta", {})
    body = data.get("body", {})

    parts = [f"<h1>{meta.get('title', '')}</h1>"]
    if meta.get("published_time"):
        parts.append(f"<p><em>Published: {meta['published_time']}</em></p>")
    if meta.get("description"):
        parts.append(f"<p>{meta['description']}</p>")
    for p in body.get("paragraphs", []):
        parts.append(f"<p>{p}</p>")
    for im in body.get("images", []):
        cap = im.get("caption") or ""
        parts.append(
            f'<figure><img src="{im["src"]}" alt="{cap}">'
            f"<figcaption>{cap}</figcaption></figure>"
        )

    with open(path, "w", encoding="utf-8") as fh:
        fh.write('<html><meta charset="utf-8"><body>\n')
        fh.write("\n".join(parts))
        fh.write("\n</body></html>\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def scrape_article(
    url: str,
    out_prefix: str = "article",
    out_dir: str = "articles",
) -> tuple[str, str]:
    """Scrape *url*, save JSON + HTML preview, return their paths.

    @param url: Full article URL.
    @param out_prefix: Filename prefix (e.g. ``article_1``).
    @param out_dir: Directory to write output files into.
    @return: ``(json_path, html_path)`` tuple.
    """
    raw_html = _fetch_html(url)
    time.sleep(SLEEP_BETWEEN_REQUESTS)

    soup = BeautifulSoup(raw_html, "html.parser")
    metadata = _extract_metadata(soup, url)
    body = _extract_body(soup, url)

    payload: dict[str, Any] = {
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source_url": url,
        "meta": metadata,
        "body": body,
    }

    os.makedirs(out_dir, exist_ok=True)
    base = os.path.basename(out_prefix)
    json_path = os.path.join(out_dir, f"{base}.json")
    html_path = os.path.join(out_dir, f"{base}.html")

    _save_json(payload, json_path)
    _save_html_preview(payload, html_path)

    return json_path, html_path
