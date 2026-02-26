"""Batch crawler — fetch article URLs, scrape, and save locally."""

from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass, field

from .url_fetcher import fetch_article_urls
from .content_scraper import scrape_article

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_CATEGORY_URL = "https://vnexpress.net/kinh-doanh"
DEFAULT_OUT_DIR = "articles"
DEFAULT_PROCESSED_FILE = "processed_urls.txt"
DEFAULT_DAILY_LIMIT = 10


@dataclass
class CrawlConfig:
    """All tunables for a single crawl run."""

    category_url: str = DEFAULT_CATEGORY_URL
    out_dir: str = DEFAULT_OUT_DIR
    processed_file: str = DEFAULT_PROCESSED_FILE
    daily_limit: int = DEFAULT_DAILY_LIMIT
    clean_before_run: bool = False
    fetch_pool_size: int = 50


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_processed(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    with open(path, "r", encoding="utf-8") as fh:
        return {line.strip() for line in fh if line.strip()}


def _save_processed(path: str, url: str) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(url + "\n")


def _next_article_number(out_dir: str) -> int:
    if not os.path.exists(out_dir):
        return 1
    nums = []
    for name in os.listdir(out_dir):
        if name.startswith("article_") and name.endswith(".json"):
            try:
                nums.append(int(name.removeprefix("article_").removesuffix(".json")))
            except ValueError:
                continue
    return (max(nums) + 1) if nums else 1


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass
class CrawlResult:
    """Summary returned after a crawl run."""

    processed: int = 0
    failed: int = 0
    skipped: int = 0
    saved_files: list[str] = field(default_factory=list)


def crawl_articles(config: CrawlConfig | None = None) -> CrawlResult:
    """Run an end-to-end crawl using *config* (defaults are sensible).

    Steps:
      1. Optionally clean the output directory.
      2. Load previously-processed URLs.
      3. Fetch fresh article URLs from the category page.
      4. Scrape up to ``daily_limit`` new articles and save JSON + HTML.

    @param config: Crawl configuration. ``None`` uses defaults.
    @return: A {@link CrawlResult} summarising the run.
    """
    cfg = config or CrawlConfig()
    result = CrawlResult()

    # Clean output dir if requested
    if cfg.clean_before_run and os.path.exists(cfg.out_dir):
        shutil.rmtree(cfg.out_dir)

    os.makedirs(cfg.out_dir, exist_ok=True)

    # Load processed URLs
    processed = _load_processed(cfg.processed_file)
    logger.info("Loaded %d previously-processed URLs", len(processed))

    # Fetch candidate URLs
    urls = fetch_article_urls(category_url=cfg.category_url, limit=cfg.fetch_pool_size)
    new_urls = [u for u in urls if u not in processed]
    logger.info("Found %d new article URLs (of %d total)", len(new_urls), len(urls))

    # Scrape
    start_num = _next_article_number(cfg.out_dir)
    for idx, url in enumerate(new_urls[: cfg.daily_limit]):
        article_num = start_num + idx
        prefix = f"article_{article_num}"
        logger.info("Scraping article %d: %s", article_num, url)

        try:
            json_path, _ = scrape_article(url, prefix, cfg.out_dir)
            _save_processed(cfg.processed_file, url)
            result.processed += 1
            result.saved_files.append(json_path)
            logger.info("Saved %s", json_path)
        except Exception:
            logger.exception("Failed to process %s", url)
            result.failed += 1

        # Small delay between articles
        if idx < len(new_urls[: cfg.daily_limit]) - 1:
            time.sleep(1)

    result.skipped = len(processed)
    logger.info(
        "Crawl complete — processed=%d, failed=%d, skipped=%d",
        result.processed,
        result.failed,
        result.skipped,
    )
    return result
