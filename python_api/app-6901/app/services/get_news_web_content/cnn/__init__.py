"""
get_news_web_content — scrape Vietnamese news articles from category pages.

Public API
----------
- ``fetch_article_urls`` : collect article links from a category page
- ``scrape_article``     : download + parse a single article
- ``crawl_articles``     : end-to-end batch pipeline (fetch → scrape → save)
"""

from .url_fetcher import fetch_article_urls
from .content_scraper import scrape_article
from .crawler import crawl_articles

__all__ = [
    "fetch_article_urls",
    "scrape_article",
    "crawl_articles",
]
