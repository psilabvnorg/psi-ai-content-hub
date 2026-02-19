from __future__ import annotations

import hashlib
import imghdr
import logging
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

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


def _download_single_image(
    image: ImageResult,
    output_root: Path,
    timeout_seconds: int,
) -> tuple[ImageResult | None, str | None]:
    import requests
    from PIL import Image

    source_root = output_root / image.source
    source_root.mkdir(parents=True, exist_ok=True)

    head_content_type: str | None = None
    try:
        head_response = requests.head(image.url, allow_redirects=True, timeout=timeout_seconds)
        if head_response.ok:
            head_content_type = head_response.headers.get("Content-Type")
            if head_content_type and not head_content_type.lower().startswith("image/"):
                return None, f"Non-image content type for {image.url}: {head_content_type}"
    except Exception:
        # Some sources block HEAD, fallback to GET.
        pass

    response = requests.get(
        image.url,
        stream=True,
        allow_redirects=True,
        timeout=timeout_seconds,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        },
    )
    response.raise_for_status()

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

