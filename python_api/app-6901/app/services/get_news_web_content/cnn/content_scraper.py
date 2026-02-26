"""Scrape and parse a single CNN news article into structured data."""

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
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_text(text: str | None) -> str | None:
    """Strip HTML entities and normalise whitespace."""
    if not text:
        return None
    text = html_mod.unescape(text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"&[a-zA-Z]+;", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip() or None


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
    raise RuntimeError("Unexpected fetch failure")


# ---------------------------------------------------------------------------
# JSON-LD extraction (primary metadata source for CNN)
# ---------------------------------------------------------------------------


def _extract_json_ld(soup: BeautifulSoup) -> dict[str, Any]:
    """Parse the first NewsArticle JSON-LD block on the page."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        # Handle @graph wrapper
        if isinstance(data, dict) and "@graph" in data:
            items = data["@graph"]
        elif isinstance(data, list):
            items = data
        else:
            items = [data]

        for item in items:
            if isinstance(item, dict) and item.get("@type") in (
                "NewsArticle",
                "Article",
                "ReportageNewsArticle",
            ):
                return item

    return {}


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def _extract_metadata(soup: BeautifulSoup, base_url: str) -> dict[str, Any]:
    """Pull metadata from JSON-LD (primary) and meta tags (fallback)."""

    def _meta(names: list[str]) -> str | None:
        for name in names:
            tag = soup.find("meta", attrs={"property": name}) or soup.find(
                "meta", attrs={"name": name}
            )
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    ld = _extract_json_ld(soup)

    # --- Title ---
    title: str | None = None
    if ld.get("headline"):
        title = _clean_text(ld["headline"])
    if not title:
        title = _clean_text(_meta(["og:title", "twitter:title"]))
    if not title and soup.find("h1"):
        title = _clean_text(soup.find("h1").get_text())  # type: ignore[union-attr]

    # --- Description ---
    description: str | None = ld.get("description") or _meta(
        ["og:description", "description", "twitter:description"]
    )

    # --- URL ---
    url: str = ld.get("url") or ld.get("mainEntityOfPage", {}).get("@id") or _meta(["og:url"]) or base_url  # type: ignore[union-attr]

    # --- Image ---
    image: str | None = None
    ld_images = ld.get("image")
    if ld_images:
        if isinstance(ld_images, list) and ld_images:
            first = ld_images[0]
            image = first.get("contentUrl") or first.get("url") if isinstance(first, dict) else first
        elif isinstance(ld_images, dict):
            image = ld_images.get("contentUrl") or ld_images.get("url")
        elif isinstance(ld_images, str):
            image = ld_images
    if not image:
        image = _meta(["og:image", "twitter:image"])
    if image:
        image = urljoin(base_url, image)

    # --- Published / Modified time ---
    published_time: str | None = (
        ld.get("datePublished")
        or _meta(["article:published_time", "pubdate", "datePublished"])
    )
    modified_time: str | None = (
        ld.get("dateModified")
        or _meta(["article:modified_time", "lastmod", "dateModified"])
    )
    # Fallback: data-first-publish attribute on timestamp span
    if not published_time:
        ts_span = soup.find(attrs={"data-first-publish": True})
        if ts_span:
            published_time = ts_span.get("data-first-publish")  # type: ignore[assignment]

    # --- Author ---
    author: str | None = None
    ld_author = ld.get("author")
    if ld_author:
        if isinstance(ld_author, list) and ld_author:
            names = [a.get("name") for a in ld_author if isinstance(a, dict) and a.get("name")]
            author = ", ".join(names) if names else None
        elif isinstance(ld_author, dict):
            author = ld_author.get("name")
        elif isinstance(ld_author, str):
            author = ld_author
    if not author:
        # CNN byline: span.byline__name
        byline = soup.select_one("span.byline__name")
        if byline:
            author = _clean_text(byline.get_text())
    if not author:
        author = _meta(["author", "article:author"])

    # --- Publisher ---
    publisher: str | None = None
    ld_pub = ld.get("publisher")
    if isinstance(ld_pub, dict):
        publisher = ld_pub.get("name")
    if not publisher:
        publisher = _meta(["article:publisher"]) or "CNN"

    # --- Categories ---
    categories: list[str] = []
    ld_section = ld.get("articleSection")
    if isinstance(ld_section, list):
        categories = [s for s in ld_section if isinstance(s, str)]
    elif isinstance(ld_section, str):
        categories = [ld_section]
    if not categories:
        kicker = soup.select_one(".headline__kicker")
        if kicker:
            text = _clean_text(kicker.get_text())
            if text:
                categories = [text]

    # --- Tags ---
    tags: list[str] = [
        t["content"].strip()
        for t in soup.find_all("meta", attrs={"property": "article:tag"})
        if t.get("content")
    ]

    return {
        "title": title,
        "description": (_clean_text(description) or "").strip() or None,
        "publisher": publisher,
        "url": url,
        "image": image,
        "published_time": published_time,
        "modified_time": modified_time,
        "author": author,
        "categories": categories,
        "tags": tags,
    }


def _find_article_container(soup: BeautifulSoup) -> Tag:
    """Locate the main article body element, preferring CNN-specific selectors."""

    # 1. CNN primary: div.article__content (itemprop="articleBody")
    container = soup.select_one("div.article__content")
    if container and isinstance(container, Tag):
        return container

    # 2. article element
    article = soup.find("article")
    if article and isinstance(article, Tag):
        return article

    # 3. itemprop="articleBody"
    itemprop = soup.find(attrs={"itemprop": "articleBody"})
    if itemprop and isinstance(itemprop, Tag):
        return itemprop

    # 4. Largest div by paragraph count
    best: Tag | None = None
    best_count = 0
    for div in soup.find_all("div"):
        count = len(div.find_all("p"))
        if count > best_count:
            best = div
            best_count = count

    return best or soup.body or soup


def _extract_body(
    soup: BeautifulSoup, base_url: str
) -> dict[str, list[str] | list[dict[str, str | None]]]:
    """Extract paragraphs and images from the CNN article body."""
    container = _find_article_container(soup)

    # CNN paragraph class: "paragraph-elevate" (may also be plain <p>)
    cnn_paras = container.select("p.paragraph-elevate")
    if cnn_paras:
        paragraphs = [
            p.get_text(separator=" ", strip=True)
            for p in cnn_paras
            if len(p.get_text(strip=True)) > 30
        ]
    else:
        paragraphs = [
            p.get_text(separator=" ", strip=True)
            for p in container.find_all("p")
            if len(p.get_text(strip=True)) > 30
        ]

    # Images — CNN wraps them in div with class containing "image_large"
    seen_srcs: set[str] = set()
    images: list[dict[str, str | None]] = []

    for img_wrapper in soup.select("div[class*='image_large']"):
        img_tag = img_wrapper.find("img")
        if not img_tag:
            continue
        src = (
            img_tag.get("data-src")
            or img_tag.get("data-original")
            or img_tag.get("src")
        )
        if not src:
            continue
        src = urljoin(base_url, src)
        if src in seen_srcs:
            continue
        seen_srcs.add(src)

        # Caption
        caption: str | None = None
        cap_div = img_wrapper.select_one("div[itemprop='caption'], div.image_large__caption")
        if cap_div:
            caption = _clean_text(cap_div.get_text())
        # Credit/attribution
        credit: str | None = None
        credit_tag = img_wrapper.select_one("figcaption.image_large__credit, .image__credit")
        if credit_tag:
            credit = _clean_text(credit_tag.get_text())

        images.append({"src": src, "caption": caption, "credit": credit})

    # Fallback: collect all <img> in container if none found above
    if not images:
        for img in container.find_all("img"):
            src = img.get("data-src") or img.get("data-original") or img.get("src")
            if not src:
                continue
            src = urljoin(base_url, src)
            if src in seen_srcs:
                continue
            seen_srcs.add(src)

            caption = None
            fig = img.find_parent("figure")
            if fig:
                cap_tag = fig.find("figcaption")
                if cap_tag:
                    caption = _clean_text(cap_tag.get_text())

            images.append({"src": src, "caption": caption, "credit": None})

    return {"paragraphs": paragraphs, "images": images}


# ---------------------------------------------------------------------------
# Save helpers
# ---------------------------------------------------------------------------


def _save_json(data: dict[str, Any], path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def _save_html_preview(data: dict[str, Any], path: str) -> None:
    """Write a minimal HTML preview file."""
    meta = data.get("meta", {})
    body = data.get("body", {})

    parts = [f"<h1>{meta.get('title', '')}</h1>"]
    if meta.get("author"):
        parts.append(f"<p><strong>By {meta['author']}</strong></p>")
    if meta.get("published_time"):
        parts.append(f"<p><em>Published: {meta['published_time']}</em></p>")
    if meta.get("description"):
        parts.append(f"<p>{meta['description']}</p>")
    for p in body.get("paragraphs", []):
        parts.append(f"<p>{p}</p>")
    for im in body.get("images", []):
        cap = im.get("caption") or ""
        credit = im.get("credit") or ""
        caption_text = f"{cap} {credit}".strip()
        parts.append(
            f'<figure><img src="{im["src"]}" alt="{caption_text}" style="max-width:100%">'
            f"<figcaption>{caption_text}</figcaption></figure>"
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

    @param url: Full CNN article URL.
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
