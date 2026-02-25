from __future__ import annotations

import logging
import re
import time
from urllib.parse import quote_plus

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)

# Image URL extensions considered valid for extraction from page source.
_IMAGE_URL_RE = re.compile(r'https://[^"\'\\<>\s]+\.(?:jpg|jpeg|png|webp)', re.IGNORECASE)

_DISALLOWED_HOSTS = (
    "google.com",
    "gstatic.com",
    "googleapis.com",
    "googleusercontent.com",
    "schema.org",
    "w3.org",
)


def _is_valid_image_url(url: str) -> bool:
    """Return True if *url* looks like a genuine third-party image."""
    if not url.startswith("https://"):
        return False
    lower = url.lower()
    return not any(host in lower for host in _DISALLOWED_HOSTS)


def search_google_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Google Images via Selenium and return candidate full image URLs.

    Uses multiple strategies in order:
    1. Click ``div.H8Rx8c`` containers to open the preview panel and extract
       the full-size image from ``img.sFlh5c.FyHeAf.iPVvYb``.
    2. Regex-scrape the raw page source for image URLs (jpg/png/webp).

    @param query The image search query string.
    @param max_results Maximum number of image results to return.
    @param timeout_seconds Timeout in seconds for page loads and element waits.
    """
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import TimeoutException, WebDriverException
    except ImportError as exc:
        LOGGER.warning("[GoogleSearch] Missing dependencies (undetected_chromedriver or selenium): %s", exc)
        return []

    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    results: list[ImageResult] = []
    seen: set[str] = set()
    driver = None

    try:
        LOGGER.warning("[GoogleSearch] Starting: query=%r, max_results=%d, timeout=%ds", query, max_results, timeout_seconds)
        driver = uc.Chrome(options=options)

        encoded_query = quote_plus(query)
        driver.get(f"https://www.google.com/search?tbm=isch&q={encoded_query}")

        wait = WebDriverWait(driver, timeout_seconds)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "img")))

        for _ in range(4):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)

        # --- Strategy 1: click container → preview panel → full-size URL ---
        containers = driver.find_elements(By.CSS_SELECTOR, "div.H8Rx8c")

        for container in containers:
            if len(results) >= max_results:
                break
            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", container)
                driver.execute_script("arguments[0].click();", container)
                time.sleep(0.8)
            except WebDriverException:
                continue

            # Try current preview selectors (may change over time)
            for sel in ("img.sFlh5c.FyHeAf.iPVvYb", "img.sFlh5c", "img.iPVvYb", "img.n3VNCb"):
                candidates = driver.find_elements(By.CSS_SELECTOR, sel)
                for candidate in candidates:
                    src = candidate.get_attribute("src") or ""
                    if src and _is_valid_image_url(src) and src not in seen:
                        seen.add(src)
                        results.append(ImageResult(source="google", url=src))
                        break
                if len(results) > 0 and results[-1].url in seen:
                    break  # found one for this container, move on

        # --- Strategy 2: regex extraction from page source ---
        if len(results) < max_results:
            page_source = driver.page_source
            for match in _IMAGE_URL_RE.finditer(page_source):
                if len(results) >= max_results:
                    break
                url = match.group(0)
                if _is_valid_image_url(url) and url not in seen:
                    seen.add(url)
                    results.append(ImageResult(source="google", url=url))

    except (TimeoutException, WebDriverException) as exc:
        LOGGER.warning("[GoogleSearch] Failed: %s", exc)
    except Exception as exc:
        LOGGER.warning("[GoogleSearch] Unexpected error: %s", exc)
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    LOGGER.warning("[GoogleSearch] Complete: returning %d results", len(results))
    return results[:max_results]

