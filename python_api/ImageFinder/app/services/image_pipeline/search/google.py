from __future__ import annotations

import logging
import time
from urllib.parse import quote_plus

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)


def _is_valid_google_image_url(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    disallowed_hosts = (
        "https://encrypted-tbn0.gstatic.com/",
        "https://encrypted-tbn1.gstatic.com/",
        "https://encrypted-tbn2.gstatic.com/",
        "https://encrypted-tbn3.gstatic.com/",
        "https://www.google.com/",
    )
    return not url.startswith(disallowed_hosts)


def search_google_images(
    query: str,
    limit: int = 5,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Google Images via Selenium and return candidate full image URLs."""
    if limit <= 0:
        return []

    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException, WebDriverException
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    driver = None
    results: list[ImageResult] = []
    seen: set[str] = set()

    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        encoded_query = quote_plus(query)
        driver.get(f"https://www.google.com/search?tbm=isch&q={encoded_query}")

        wait = WebDriverWait(driver, timeout_seconds)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "img")))

        for _ in range(4):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)

        thumbnails = driver.find_elements(By.CSS_SELECTOR, "img.Q4LuWd")
        for thumb in thumbnails:
            if len(results) >= limit:
                break

            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", thumb)
                thumb.click()
                time.sleep(0.7)
            except WebDriverException:
                continue

            candidates = driver.find_elements(By.CSS_SELECTOR, "img.sFlh5c.FyHeAf.iPVvYb")
            if not candidates:
                candidates = driver.find_elements(By.CSS_SELECTOR, "img.n3VNCb")

            for candidate in candidates:
                src = candidate.get_attribute("src") or ""
                if not src or not _is_valid_google_image_url(src) or src in seen:
                    continue
                seen.add(src)
                results.append(ImageResult(source="google", url=src))
                break

        if len(results) < limit:
            # Fallback scrape for pages where preview selectors differ.
            all_images = driver.find_elements(By.TAG_NAME, "img")
            for image in all_images:
                if len(results) >= limit:
                    break
                src = image.get_attribute("src") or ""
                if not src or not _is_valid_google_image_url(src) or src in seen:
                    continue
                seen.add(src)
                results.append(ImageResult(source="google", url=src))

    except (TimeoutException, WebDriverException) as exc:
        LOGGER.warning("Google image search failed: %s", exc)
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    return results[:limit]

