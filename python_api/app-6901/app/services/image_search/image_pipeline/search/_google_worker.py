"""
Standalone worker script for Google Images search via undetected_chromedriver.

Called as a subprocess so Chrome escapes Electron's Windows Job Object restrictions.
Outputs a JSON array of image URLs to stdout.

Usage:
    python _google_worker.py <query> <max_results> <timeout_seconds>
"""
from __future__ import annotations

import json
import re
import sys
import time
from urllib.parse import quote_plus


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
    if not url.startswith("https://"):
        return False
    lower = url.lower()
    return not any(host in lower for host in _DISALLOWED_HOSTS)


def _get_chrome_major_version() -> int | None:
    import re as _re

    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            for key_path in (
                r"Software\Google\Chrome\BLBeacon",
                r"Software\Chromium\BLBeacon",
            ):
                try:
                    with winreg.OpenKey(hive, key_path) as k:
                        version_str, _ = winreg.QueryValueEx(k, "version")
                        m = _re.search(r"^(\d+)\.", str(version_str))
                        if m:
                            return int(m.group(1))
                except OSError:
                    continue
    except ImportError:
        pass

    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    import os
    for path in chrome_paths:
        try:
            exe_dir = os.path.dirname(path)
            dirs = [d for d in os.listdir(exe_dir) if _re.match(r"^\d+\.\d+\.\d+\.\d+$", d)]
            if dirs:
                m = _re.search(r"^(\d+)\.", sorted(dirs)[-1])
                if m:
                    return int(m.group(1))
        except Exception:
            continue

    return None


def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    timeout_seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    results: list[str] = []

    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import TimeoutException, WebDriverException
    except ImportError as exc:
        print(json.dumps({"error": f"Missing dependencies: {exc}", "urls": []}))
        return

    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-gpu-sandbox")
    options.add_argument("--disable-setuid-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=en-US,en;q=0.9")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36"
    )

    driver = None
    seen: set[str] = set()

    try:
        chrome_version = _get_chrome_major_version()
        driver = uc.Chrome(options=options, version_main=chrome_version)

        # Hide webdriver flag from JavaScript
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
        )

        encoded_query = quote_plus(query)
        driver.get(f"https://www.google.com/search?tbm=isch&q={encoded_query}")

        # Fail fast if Google has served a CAPTCHA / bot-detection page.
        # Waiting on the CAPTCHA page causes Chrome's renderer to crash.
        if "/sorry/" in driver.current_url:
            print(json.dumps({"error": "Google blocked request (CAPTCHA). Try again later.", "urls": []}))
            return

        wait = WebDriverWait(driver, timeout_seconds)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "img")))

        for _ in range(4):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)

        # Strategy 1: click container → preview panel → full-size URL
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

            for sel in ("img.sFlh5c.FyHeAf.iPVvYb", "img.sFlh5c", "img.iPVvYb", "img.n3VNCb"):
                candidates = driver.find_elements(By.CSS_SELECTOR, sel)
                for candidate in candidates:
                    src = candidate.get_attribute("src") or ""
                    if src and _is_valid_image_url(src) and src not in seen:
                        seen.add(src)
                        results.append(src)
                        break
                if results and results[-1] in seen:
                    break

        # Strategy 2: regex from page source
        if len(results) < max_results:
            page_source = driver.page_source
            for match in _IMAGE_URL_RE.finditer(page_source):
                if len(results) >= max_results:
                    break
                url = match.group(0)
                if _is_valid_image_url(url) and url not in seen:
                    seen.add(url)
                    results.append(url)

        print(json.dumps({"urls": results[:max_results]}))

    except (TimeoutException, WebDriverException) as exc:
        print(json.dumps({"error": str(exc)[:500], "urls": results}))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:500], "urls": results}))
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
