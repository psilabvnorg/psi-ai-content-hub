from __future__ import annotations

import io
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse
from urllib.request import Request, urlopen

try:
    import torch
    from PIL import Image, UnidentifiedImageError
    from torchvision import transforms as _tv_transforms
    from transformers import AutoModelForImageSegmentation

    torch.set_float32_matmul_precision("high")
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    _transform_image = _tv_transforms.Compose(
        [
            _tv_transforms.Resize((1024, 1024)),
            _tv_transforms.ToTensor(),
            _tv_transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    _deps_available = True
except ImportError:
    torch = None  # type: ignore[assignment]
    Image = None  # type: ignore[assignment,misc]
    UnidentifiedImageError = Exception  # type: ignore[assignment,misc]
    AutoModelForImageSegmentation = None  # type: ignore[assignment,misc]
    _device = "cpu"
    _transform_image = None  # type: ignore[assignment]
    _deps_available = False

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import MODEL_BIREFNET_DIR, TEMP_DIR
from python_api.common.progress import ProgressStore


MODEL_ID = "ZhengPeng7/BiRefNet"
RESULT_RETENTION_SECONDS = 60 * 60

progress_store = ProgressStore()

_model: Optional[Any] = None
_model_loading = False
_model_error: Optional[str] = None
_model_lock = threading.Lock()

_model_downloading = False
_model_download_error: Optional[str] = None
_download_lock = threading.Lock()

_task_results: Dict[str, Dict[str, Any]] = {}
_result_lock = threading.Lock()


def _is_model_on_disk() -> bool:
    repo_dir = MODEL_BIREFNET_DIR / f"models--{MODEL_ID.replace('/', '--')}"
    snapshots_dir = repo_dir / "snapshots"
    try:
        return snapshots_dir.exists() and any(snapshots_dir.iterdir())
    except Exception:
        return False


def _new_task_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _save_png(image: Image.Image, name: str) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    file_path = TEMP_DIR / name
    image.save(file_path, format="PNG")
    return file_path


def _open_image_from_bytes(data: bytes) -> Any:
    if not _deps_available or Image is None:
        raise RuntimeError("Dependencies not installed. Use 'Install Library' to install required packages.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            return image.convert("RGB")
    except UnidentifiedImageError as exc:
        raise ValueError("Invalid image content") from exc


def _download_image_from_url(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are allowed")

    request = Request(url, headers={"User-Agent": "psi-ai-content-hub/bgremove"})
    with urlopen(request, timeout=20) as response:
        content_type = str(response.headers.get("Content-Type") or "").lower()
        if content_type and not content_type.startswith("image/"):
            raise ValueError("URL does not point to an image")
        data = response.read()

    if not data:
        raise ValueError("URL returned empty content")
    if len(data) > 20 * 1024 * 1024:
        raise ValueError("Image is too large (max 20 MB)")
    return data


def _ensure_model_loaded(task_id: Optional[str] = None) -> bool:
    global _model, _model_loading, _model_error

    if not _deps_available:
        msg = "Dependencies not installed. Use 'Install Library' in the Environment Status row to install required packages."
        if task_id:
            progress_store.set_progress(task_id, "error", 0, msg)
        with _model_lock:
            _model_error = msg
        return False

    while True:
        with _model_lock:
            if _model is not None:
                return True
            if _model_loading:
                pass
            else:
                _model_loading = True
                _model_error = None
                break
        time.sleep(0.2)

    loading_done = threading.Event()

    def _tick_progress() -> None:
        percent = 15
        while not loading_done.is_set() and percent < 90:
            loading_done.wait(timeout=4)
            if not loading_done.is_set():
                percent = min(percent + 3, 90)
                if task_id:
                    progress_store.set_progress(task_id, "loading_model", percent, "Downloading / loading model weights...")

    try:
        if task_id:
            progress_store.add_log(task_id, "Loading segmentation model...")
            progress_store.set_progress(task_id, "loading_model", 10, "Downloading model files...")
            threading.Thread(target=_tick_progress, daemon=True).start()
        loaded_model = AutoModelForImageSegmentation.from_pretrained(MODEL_ID, trust_remote_code=True, cache_dir=str(MODEL_BIREFNET_DIR))
        loading_done.set()
        loaded_model.to(_device)
        loaded_model.eval()
        with _model_lock:
            _model = loaded_model
            _model_error = None
            _model_loading = False
        if task_id:
            progress_store.set_progress(task_id, "complete", 100, "Model loaded successfully.")
        return True
    except Exception as exc:
        loading_done.set()
        err = str(exc)
        with _model_lock:
            _model = None
            _model_error = err
            _model_loading = False
        if task_id:
            progress_store.add_log(task_id, f"Model load failed: {err}")
            progress_store.set_progress(task_id, "error", 0, err)
        log(f"Background removal model load failed: {err}", "error", log_name="background-removal.log")
        return False


def start_model_download() -> Optional[str]:
    global _model_downloading, _model_download_error

    if not _deps_available:
        return None

    with _download_lock:
        if _model_downloading:
            return None
        if _is_model_on_disk():
            return None
        _model_downloading = True
        _model_download_error = None

    task_id = _new_task_id("bgdownload")
    progress_store.set_progress(task_id, "downloading", 5, "Downloading model files...")

    def runner() -> None:
        global _model_downloading, _model_download_error
        loading_done = threading.Event()

        def _tick() -> None:
            percent = 5
            while not loading_done.is_set() and percent < 90:
                loading_done.wait(timeout=4)
                if not loading_done.is_set():
                    percent = min(percent + 2, 90)
                    progress_store.set_progress(task_id, "downloading", percent, "Downloading model files...")

        try:
            threading.Thread(target=_tick, daemon=True).start()
            from huggingface_hub import snapshot_download
            snapshot_download(MODEL_ID, cache_dir=str(MODEL_BIREFNET_DIR))
            loading_done.set()
            with _download_lock:
                _model_downloading = False
                _model_download_error = None
            progress_store.set_progress(task_id, "complete", 100, "Download complete. Click 'Load Model' to load into memory.")
        except Exception as exc:
            loading_done.set()
            err = str(exc)
            with _download_lock:
                _model_downloading = False
                _model_download_error = err
            progress_store.set_progress(task_id, "error", 0, err)
            log(f"Model download failed: {err}", "error", log_name="background-removal.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def start_model_load() -> Optional[str]:
    if not _deps_available:
        return None

    with _model_lock:
        already_ready = _model is not None
        already_loading = _model_loading
    if already_ready or already_loading:
        return None

    task_id = _new_task_id("bgload")
    progress_store.set_progress(task_id, "starting", 0, "Loading model into memory...")

    def runner() -> None:
        _ensure_model_loaded(task_id)

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def model_status() -> dict:
    with _model_lock:
        with _download_lock:
            return {
                "model_id": MODEL_ID,
                "model_loaded": _model is not None,
                "model_loading": _model_loading,
                "model_error": _model_error if _deps_available else "torch/torchvision/transformers not installed",
                "model_downloaded": _is_model_on_disk(),
                "model_downloading": _model_downloading,
                "model_download_error": _model_download_error,
                "device": _device,
            }


def _run_inference(image: Image.Image) -> Image.Image:
    if not _deps_available or _transform_image is None or torch is None:
        raise RuntimeError("Dependencies not installed")
    with _model_lock:
        model = _model
    if model is None:
        raise RuntimeError("Model is not loaded")

    image_size = image.size
    input_tensor = _transform_image(image).unsqueeze(0).to(_device)
    with torch.no_grad():
        preds = model(input_tensor)[-1].sigmoid().cpu()
    pred = preds[0].squeeze()
    mask = transforms.ToPILImage()(pred).resize(image_size)
    result = image.copy()
    result.putalpha(mask)
    return result


def _store_result(
    task_id: str,
    job_store: JobStore,
    original: Image.Image,
    processed: Image.Image,
    base_name: str,
) -> None:
    stamp = int(time.time())
    unique = uuid.uuid4().hex[:8]

    original_filename = f"{base_name}_{stamp}_{unique}_original.png"
    processed_filename = f"{base_name}_{stamp}_{unique}.png"

    original_path = _save_png(original, original_filename)
    processed_path = _save_png(processed, processed_filename)

    original_record = job_store.add_file(original_path, original_filename)
    processed_record = job_store.add_file(processed_path, processed_filename)

    with _result_lock:
        _task_results[task_id] = {
            "created_at": time.time(),
            "filename": processed_filename,
            "original_file_id": original_record.file_id,
            "processed_file_id": processed_record.file_id,
        }


def _process_task(job_store: JobStore, image_data: bytes, base_name: str) -> str:
    task_id = _new_task_id("bgremove")
    progress_store.set_progress(task_id, "starting", 0, "Starting background removal...")

    def runner() -> None:
        try:
            progress_store.set_progress(task_id, "preparing", 5, "Preparing image...")
            image = _open_image_from_bytes(image_data)

            if not _ensure_model_loaded(task_id):
                progress_store.set_progress(task_id, "error", 0, "Model failed to load")
                return

            progress_store.set_progress(task_id, "processing", 45, "Removing background...")
            processed = _run_inference(image)

            progress_store.set_progress(task_id, "saving", 80, "Saving result...")
            _store_result(task_id, job_store, image, processed, base_name)

            progress_store.set_progress(task_id, "complete", 100, "Background removed")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Background removal task failed: {exc}", "error", log_name="background-removal.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def process_upload(job_store: JobStore, filename: str, image_data: bytes) -> str:
    base_name = Path(filename or "image").stem or "image"
    return _process_task(job_store, image_data, base_name)


def process_url(job_store: JobStore, url: str) -> str:
    image_data = _download_image_from_url(url)
    # Validate URL payload before queueing so clients get a clean 400 on non-images.
    # Skip early validation when deps are not yet installed; the task thread will report the error.
    if _deps_available:
        _open_image_from_bytes(image_data)
    parsed = urlparse(url)
    name = Path(parsed.path).name or "image"
    base_name = Path(name).stem or "image"
    return _process_task(job_store, image_data, base_name)


def get_result(task_id: str) -> Optional[dict]:
    with _result_lock:
        record = _task_results.get(task_id)
    if not record:
        return None
    original_id = record["original_file_id"]
    processed_id = record["processed_file_id"]
    return {
        "status": "success",
        "filename": record["filename"],
        "original_url": f"/api/v1/files/{original_id}",
        "processed_url": f"/api/v1/files/{processed_id}",
        "download_url": f"/api/v1/files/{processed_id}?download=1",
    }


def unload_model() -> dict:
    global _model, _model_error
    with _model_lock:
        if _model is not None:
            del _model
            _model = None
            _model_error = None
            if _device == "cuda":
                torch.cuda.empty_cache()
            return {"status": "unloaded"}
        return {"status": "not_loaded"}


def cleanup_results() -> None:
    cutoff = time.time() - RESULT_RETENTION_SECONDS
    with _result_lock:
        expired = [task_id for task_id, record in _task_results.items() if record["created_at"] < cutoff]
        for task_id in expired:
            _task_results.pop(task_id, None)
