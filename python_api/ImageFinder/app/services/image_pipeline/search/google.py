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
    max_results: int = 10,
) -> list[dict]:
    """Search Google Images via Selenium and return candidate full image URLs."""
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
    except ImportError:
        return []

    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    try:
        driver = uc.Chrome(options=options)  # auto-manages ChromeDriver version

        encoded_query = quote_plus(query)
        driver.get(f"https://www.google.com/search?tbm=isch&q={encoded_query}")

        wait = WebDriverWait(driver, 30)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "img")))

        for _ in range(4):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)

        thumbnails = driver.find_elements(By.CSS_SELECTOR, "img.Q4LuWd")
        for thumb in thumbnails:
            if max_results <= 0:
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

        if len(results) < max_results:
            # Fallback scrape for pages where preview selectors differ.
            all_images = driver.find_elements(By.TAG_NAME, "img")
            for image in all_images:
                if len(results) >= max_results:
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

    return results[:max_results]

