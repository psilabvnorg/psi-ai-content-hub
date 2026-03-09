from __future__ import annotations

import threading
import uuid
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from python_api.common.progress import ProgressStore
from ..services.image_finder import ALL_SOURCE_IDS, ImageFinderError, find_images


router = APIRouter(prefix="/image-finder", tags=["image-finder"])

_download_store = ProgressStore()


def _parse_int(value: object, field_name: str, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")


def _parse_sources(value: object) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="sources must be an array of source ids")

    valid = set(ALL_SOURCE_IDS)
    parsed: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise HTTPException(status_code=400, detail="sources must be an array of strings")
        normalized = item.strip()
        if not normalized:
            continue
        if normalized not in valid:
            continue
        parsed.append(normalized)

    return parsed if parsed else None


def _guess_ext(url: str) -> str:
    clean = url.split("?")[0].split("#")[0]
    suffix = clean.rsplit(".", 1)[-1].lower() if "." in clean else ""
    return suffix if suffix.isalpha() and len(suffix) <= 5 else "jpg"


def _download_images_worker(task_id: str, urls: list[str], save_dir: str) -> None:
    store = _download_store
    path = Path(save_dir)
    try:
        path.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        store.set_progress(task_id, "error", 0, f"Cannot create directory: {exc}")
        return

    total = len(urls)
    store.set_progress(task_id, "running", 0, f"Starting download of {total} images...")

    ok_count = 0
    for i, url in enumerate(urls):
        try:
            ext = _guess_ext(url)
            filename = f"image-{i + 1:03d}.{ext}"
            filepath = path / filename
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                filepath.write_bytes(resp.read())
            store.add_log(task_id, f"[OK] {filename}")
            ok_count += 1
        except Exception as exc:
            store.add_log(task_id, f"[ERROR] image-{i + 1}: {exc}")

        percent = int((i + 1) / total * 100)
        store.set_progress(task_id, "running", percent, f"Downloading {i + 1}/{total}...")

    store.set_progress(
        task_id,
        "complete",
        100,
        f"Done! {ok_count}/{total} images saved to: {save_dir}",
    )


@router.post("/search")
def image_finder_search(payload: dict = Body(...)) -> dict:
    text = str(payload.get("text") or "").strip()
    number_of_images = _parse_int(payload.get("number_of_images"), "number_of_images", 5)
    target_words = _parse_int(payload.get("target_words"), "target_words", 15)
    timeout_seconds = _parse_int(payload.get("timeout_seconds"), "timeout_seconds", 60)
    sources = _parse_sources(payload.get("sources"))
    use_llm = bool(payload.get("use_llm", True))

    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if number_of_images < 1:
        raise HTTPException(status_code=400, detail="number_of_images must be >= 1")

    try:
        result = find_images(
            text=text,
            number_of_images=number_of_images,
            target_words=target_words,
            timeout_seconds=timeout_seconds,
            sources=sources,
            use_llm=use_llm,
        )
        return {"status": "ok", **result}
    except ImageFinderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/download-all")
def image_finder_download_all(payload: dict = Body(...)) -> dict:
    urls = [u for u in (payload.get("urls") or []) if isinstance(u, str) and u.strip()]
    save_dir = str(payload.get("save_dir") or "").strip()

    if not urls:
        raise HTTPException(status_code=400, detail="urls is required")
    if not save_dir:
        raise HTTPException(status_code=400, detail="save_dir is required")

    task_id = str(uuid.uuid4())
    thread = threading.Thread(
        target=_download_images_worker,
        args=(task_id, urls, save_dir),
        daemon=True,
    )
    thread.start()

    return {"task_id": task_id}


@router.get("/download-all/stream/{task_id}")
def image_finder_download_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(_download_store.sse_stream(task_id), media_type="text/event-stream")
