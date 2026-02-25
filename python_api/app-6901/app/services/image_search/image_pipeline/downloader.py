from __future__ import annotations

import hashlib
import imghdr
import logging
import ssl
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter

from .models import ImageResult


LOGGER = logging.getLogger(__name__)
DEFAULT_TIMEOUT_SECONDS = 20
MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024

CONTENT_TYPE_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
}


def _build_download_root(download_root: Path | None) -> Path:
    if download_root is not None:
        root = download_root
    else:
        root = Path(tempfile.gettempdir()) / "psi_ai_content_hub" / "image_finder"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _guess_ext(url: str, content_type: str | None, data: bytes) -> str:
    if content_type:
        normalized = content_type.split(";")[0].strip().lower()
        if normalized in CONTENT_TYPE_TO_EXT:
            return CONTENT_TYPE_TO_EXT[normalized]

    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
        return ".jpg" if suffix == ".jpeg" else suffix

    detected = imghdr.what(None, data)
    if detected in {"jpeg", "png", "webp", "gif", "bmp"}:
        return ".jpg" if detected == "jpeg" else f".{detected}"
    return ".jpg"


# Referers to try when downloading images.  Some hosts block hotlinking unless
# the request appears to come from a search engine results page.
_REFERER_CHAIN = (
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://artvee.com/",
    None,  # fallback: no Referer at all
)


def _build_download_headers(url: str, referer: str | None = None) -> dict[str, str]:
    """Build browser-like headers for downloading an image.

    @param url The image URL (used to derive a same-origin Referer when *referer* is ``None``).
    @param referer Override Referer header.  Pass an explicit search-engine URL
        (e.g. ``https://www.google.com/``) to bypass hotlink protection.
    """
    if referer is None:
        parsed = urlparse(url)
        referer = f"{parsed.scheme}://{parsed.netloc}/"
    headers: dict[str, str] = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def _build_session() -> requests.Session:
    """Create a session with retry adapter and relaxed SSL."""
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=1)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _download_single_image(
    image: ImageResult,
    output_root: Path,
    timeout_seconds: int,
) -> tuple[ImageResult | None, str | None]:
    from PIL import Image

    source_root = output_root / image.source
    source_root.mkdir(parents=True, exist_ok=True)

    session = _build_session()

    # --- HEAD probe (best-effort, non-blocking) ---
    head_content_type: str | None = None
    try:
        head_headers = _build_download_headers(image.url, referer=_REFERER_CHAIN[0])
        head_response = session.head(
            image.url, allow_redirects=True, timeout=timeout_seconds, headers=head_headers
        )
        if head_response.ok:
            head_content_type = head_response.headers.get("Content-Type")
            if head_content_type and not head_content_type.lower().startswith("image/"):
                return None, f"Non-image content type for {image.url}: {head_content_type}"
    except Exception:
        # Some sources block HEAD; fall through to GET.
        pass

    # --- GET with referer fallback chain ---
    response: requests.Response | None = None
    last_error: Exception | None = None
    for referer in _REFERER_CHAIN:
        dl_headers = _build_download_headers(image.url, referer=referer)
        try:
            response = session.get(
                image.url,
                stream=True,
                allow_redirects=True,
                timeout=timeout_seconds,
                headers=dl_headers,
            )
            response.raise_for_status()
            break  # success
        except requests.HTTPError as exc:
            last_error = exc
            status = exc.response.status_code if exc.response is not None else 0
            if status == 403:
                LOGGER.debug("403 for %s with Referer=%s, trying next", image.url, referer)
                continue  # try next referer
            raise  # non-403 HTTP error – propagate immediately
        except requests.exceptions.SSLError:
            # Retry the same referer with SSL verification disabled.
            try:
                response = session.get(
                    image.url,
                    stream=True,
                    allow_redirects=True,
                    timeout=timeout_seconds,
                    headers=dl_headers,
                    verify=False,
                )
                response.raise_for_status()
                break
            except Exception as inner_exc:
                last_error = inner_exc
                continue

    if response is None or not response.ok:
        err = last_error or RuntimeError("All referer attempts failed")
        raise requests.HTTPError(str(err))

    session.close()

    content_type = response.headers.get("Content-Type") or head_content_type
    if content_type and not content_type.lower().startswith("image/"):
        return None, f"GET returned non-image content for {image.url}: {content_type}"

    data = response.content
    if not data:
        return None, f"Empty image payload: {image.url}"
    if len(data) > MAX_DOWNLOAD_BYTES:
        return None, f"Image too large ({len(data)} bytes): {image.url}"

    extension = _guess_ext(image.url, content_type, data)
    digest = hashlib.sha256(image.url.encode("utf-8")).hexdigest()[:16]
    output_path = source_root / f"{digest}{extension}"
    output_path.write_bytes(data)

    try:
        with Image.open(output_path) as loaded:
            loaded.verify()
    except Exception as exc:
        try:
            output_path.unlink(missing_ok=True)
        except Exception:
            pass
        return None, f"Invalid downloaded image ({image.url}): {exc}"

    return ImageResult(source=image.source, url=image.url, file_path=str(output_path)), None


def download_images(
    images: list[ImageResult],
    download_root: Path | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_workers: int = 8,
) -> tuple[list[ImageResult], list[str]]:
    """
    Download image URLs in parallel and return local file paths.

    @return Tuple of (downloaded_images, errors).
    """
    if not images:
        return [], []

    output_root = _build_download_root(download_root)
    deduplicated: list[ImageResult] = []
    seen: set[str] = set()
    for item in images:
        normalized_url = item.url.strip()
        if not normalized_url or normalized_url in seen:
            continue
        seen.add(normalized_url)
        deduplicated.append(item)

    downloaded: list[ImageResult] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=max(1, max_workers)) as executor:
        futures = {
            executor.submit(_download_single_image, image, output_root, timeout_seconds): image
            for image in deduplicated
        }
        for future in as_completed(futures):
            source_item = futures[future]
            try:
                result, error = future.result()
                if result is not None:
                    downloaded.append(result)
                if error is not None:
                    errors.append(error)
            except Exception as exc:  # pragma: no cover - defensive integration guard
                message = f"Download failed for {source_item.url}: {exc}"
                LOGGER.warning(message)
                errors.append(message)

    return downloaded, errors

