from __future__ import annotations

import logging
import re
import time
from urllib.parse import quote_plus, urlparse

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)
_KLING_FEED_URL = "https://app.klingai.com/text-to-image/feed"
_IMAGE_EXT_RE = re.compile(r"\.(?:jpg|jpeg|png|webp)(?:\?.*)?$", re.IGNORECASE)
_DISALLOWED_HOSTS = ("app.klingai.com",)
_DISALLOWED_TOKENS = ("logo", "icon", "avatar", "favicon", "sprite", ".svg")


def _is_valid_image_url(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    if not _IMAGE_EXT_RE.search(url):
        return False
    parsed = urlparse(url)
    if parsed.netloc.lower() in _DISALLOWED_HOSTS:
        return False
    lowered = url.lower()
    return not any(token in lowered for token in _DISALLOWED_TOKENS)


def search_kling_ai_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Scrape KlingAI feed images via headless browser automation."""
    if max_results <= 0:
        return []

    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
    except ImportError as exc:
        LOGGER.warning("[KlingAISearch] Missing dependencies: %s", exc)
        return []

    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = None
    seen: set[str] = set()
    results: list[ImageResult] = []

    try:
        driver = uc.Chrome(options=options)
        encoded_query = quote_plus(query.strip())
        target_url = _KLING_FEED_URL if not encoded_query else f"{_KLING_FEED_URL}?q={encoded_query}"
        driver.get(target_url)

        wait = WebDriverWait(driver, timeout_seconds)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "img")))

        for _ in range(6):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)

        for image in driver.find_elements(By.TAG_NAME, "img"):
            if len(results) >= max_results:
                break
            src = image.get_attribute("src") or image.get_attribute("data-src") or ""
            if not src or not _is_valid_image_url(src) or src in seen:
                continue
            seen.add(src)
            results.append(ImageResult(source="kling_ai", url=src))
    except Exception as exc:  # pragma: no cover - browser/runtime dependent
        LOGGER.warning("[KlingAISearch] Failed: %s", exc)
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    return results
