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
    _cuda_available = torch.cuda.is_available()
    _device = "cuda" if _cuda_available else "cpu"
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
    _cuda_available = False
    _device = "cpu"
    _transform_image = None  # type: ignore[assignment]
    _deps_available = False

try:
    import cv2
    import numpy as np
    _video_deps_available = True
except ImportError:
    cv2 = None  # type: ignore[assignment]
    np = None  # type: ignore[assignment]
    _video_deps_available = False

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import MODEL_BIREFNET_DIR, TEMP_DIR
from python_api.common.progress import ProgressStore


MODEL_ID = "ZhengPeng7/BiRefNet"
RESULT_RETENTION_SECONDS = 60 * 60
SUPPORTED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv"}
SUPPORTED_AUDIO_EXTS = {".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"}
MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB

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
        loaded_model.float()  # Ensure float32 to avoid float/half type mismatch
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
        log(f"Background removal model load failed: {err}", "error", log_name="bg-remove-overlay.log")
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
            log(f"Model download failed: {err}", "error", log_name="bg-remove-overlay.log")

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
                "cuda_available": _cuda_available,
            }


def set_device(device: str) -> dict:
    global _device, _model, _model_error

    if device not in ("cuda", "cpu"):
        raise ValueError("device must be 'cuda' or 'cpu'")
    if device == "cuda" and not _cuda_available:
        raise ValueError("CUDA is not available on this machine")

    with _model_lock:
        if _model is not None:
            del _model
            _model = None
            _model_error = None
            if _cuda_available and torch is not None:
                torch.cuda.empty_cache()
        _device = device

    return {"device": _device}


def _run_inference(image: Image.Image) -> Image.Image:
    if not _deps_available or _transform_image is None or torch is None:
        raise RuntimeError("Dependencies not installed")
    with _model_lock:
        model = _model
    if model is None:
        raise RuntimeError("Model is not loaded")

    image_size = image.size
    input_tensor = _transform_image(image).unsqueeze(0).to(device=_device, dtype=torch.float32)
    with torch.no_grad():
        preds = model(input_tensor)[-1].sigmoid().cpu()
    pred = preds[0].squeeze()
    mask = _tv_transforms.ToPILImage()(pred).resize(image_size)
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
            log(f"Background removal task failed: {exc}", "error", log_name="bg-remove-overlay.log")

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
        "processed_file_id": processed_id,
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


# ---------------------------------------------------------------------------
# Video background removal
# ---------------------------------------------------------------------------

_video_task_results: Dict[str, Dict[str, Any]] = {}
_video_result_lock = threading.Lock()


def _save_video_bytes(data: bytes, name: str) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    path = TEMP_DIR / name
    path.write_bytes(data)
    return path


def _download_video_from_url(url: str) -> tuple:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are allowed")

    request = Request(url, headers={"User-Agent": "psi-ai-content-hub/bgremove"})
    with urlopen(request, timeout=60) as response:
        content_type = str(response.headers.get("Content-Type") or "").lower()
        if content_type and not (
            content_type.startswith("video/") or content_type == "application/octet-stream"
        ):
            raise ValueError("URL does not point to a video")
        data = response.read()

    if not data:
        raise ValueError("URL returned empty content")
    if len(data) > MAX_VIDEO_SIZE_BYTES:
        raise ValueError(f"Video is too large (max {MAX_VIDEO_SIZE_BYTES // (1024 * 1024)} MB)")

    ext = Path(parsed.path).suffix.lower()
    if ext not in SUPPORTED_VIDEO_EXTS:
        ext = ".mp4"
    return data, ext


def _process_video_task(job_store: JobStore, video_path: Path, base_name: str) -> str:
    task_id = _new_task_id("bgvideo")
    progress_store.set_progress(task_id, "starting", 0, "Starting video background removal...")

    def runner() -> None:
        try:
            if not _deps_available or not _video_deps_available or cv2 is None or np is None:
                progress_store.set_progress(
                    task_id, "error", 0,
                    "Required libraries not installed (torch, opencv-python)."
                )
                return

            progress_store.set_progress(task_id, "loading_model", 2, "Ensuring model is loaded...")
            if not _ensure_model_loaded(task_id):
                progress_store.set_progress(task_id, "error", 0, "Model failed to load")
                return

            progress_store.set_progress(task_id, "opening", 5, "Opening video...")
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                progress_store.set_progress(task_id, "error", 0, "Cannot open video file")
                return

            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            ret, first_frame = cap.read()
            if not ret:
                cap.release()
                progress_store.set_progress(task_id, "error", 0, "Cannot read video frames")
                return

            h, w = first_frame.shape[:2]
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

            stamp = int(time.time())
            unique = uuid.uuid4().hex[:8]
            mask_filename = f"{base_name}_{stamp}_{unique}_mask.mp4"
            subject_filename = f"{base_name}_{stamp}_{unique}_subject.mp4"
            mask_path = TEMP_DIR / mask_filename
            subject_path = TEMP_DIR / subject_filename

            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            mask_writer = cv2.VideoWriter(str(mask_path), fourcc, fps, (w, h), isColor=False)
            subject_writer = cv2.VideoWriter(str(subject_path), fourcc, fps, (w, h), isColor=True)

            frame_idx = 0
            while True:
                ret, frame_bgr = cap.read()
                if not ret:
                    break

                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)

                processed = _run_inference(pil_image)  # Returns RGBA PIL image

                mask_pil = processed.getchannel("A")
                mask_array = np.array(mask_pil)

                # Write grayscale mask frame
                mask_writer.write(mask_array)

                # Composite foreground over black background
                fg = np.array(processed.convert("RGB")).astype(np.float32)
                alpha = mask_array.astype(np.float32) / 255.0
                alpha_3 = alpha[:, :, np.newaxis]
                composite = (fg * alpha_3).astype(np.uint8)
                subject_writer.write(cv2.cvtColor(composite, cv2.COLOR_RGB2BGR))

                frame_idx += 1
                if total_frames > 0:
                    pct = int(10 + (frame_idx / total_frames) * 80)
                else:
                    pct = min(10 + frame_idx, 89)
                progress_store.set_progress(
                    task_id, "processing", pct,
                    f"Processing frame {frame_idx}/{total_frames}..."
                )

            cap.release()
            mask_writer.release()
            subject_writer.release()

            try:
                video_path.unlink(missing_ok=True)
            except Exception:
                pass

            progress_store.set_progress(task_id, "saving", 92, "Saving result videos...")

            mask_record = job_store.add_file(mask_path, mask_filename)
            subject_record = job_store.add_file(subject_path, subject_filename)

            with _video_result_lock:
                _video_task_results[task_id] = {
                    "created_at": time.time(),
                    "mask_filename": mask_filename,
                    "subject_filename": subject_filename,
                    "mask_file_id": mask_record.file_id,
                    "subject_file_id": subject_record.file_id,
                    "frames_processed": frame_idx,
                }

            progress_store.set_progress(
                task_id, "complete", 100,
                f"Done! Processed {frame_idx} frames."
            )
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Video background removal task failed: {exc}", "error", log_name="bg-remove-overlay.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def process_video_upload(job_store: JobStore, filename: str, video_data: bytes) -> str:
    stem = Path(filename or "video").stem or "video"
    suffix = Path(filename or "video").suffix.lower()
    if suffix not in SUPPORTED_VIDEO_EXTS:
        suffix = ".mp4"

    unique = uuid.uuid4().hex
    temp_path = _save_video_bytes(video_data, f"tmp_video_{unique}{suffix}")
    return _process_video_task(job_store, temp_path, stem)


def process_video_url(job_store: JobStore, url: str) -> str:
    video_data, ext = _download_video_from_url(url)
    parsed = urlparse(url)
    stem = Path(parsed.path).stem or "video"

    unique = uuid.uuid4().hex
    temp_path = _save_video_bytes(video_data, f"tmp_video_{unique}{ext}")
    return _process_video_task(job_store, temp_path, stem)


def get_video_result(task_id: str) -> Optional[dict]:
    with _video_result_lock:
        record = _video_task_results.get(task_id)
    if not record:
        return None
    return {
        "status": "success",
        "frames_processed": record["frames_processed"],
        "mask_filename": record["mask_filename"],
        "subject_filename": record["subject_filename"],
        "mask_url": f"/api/v1/files/{record['mask_file_id']}",
        "subject_url": f"/api/v1/files/{record['subject_file_id']}",
        "mask_download_url": f"/api/v1/files/{record['mask_file_id']}?download=1",
        "subject_download_url": f"/api/v1/files/{record['subject_file_id']}?download=1",
        "subject_file_id": record["subject_file_id"],
        "mask_file_id": record["mask_file_id"],
    }


def cleanup_video_results() -> None:
    cutoff = time.time() - RESULT_RETENTION_SECONDS
    with _video_result_lock:
        expired = [
            task_id for task_id, record in _video_task_results.items()
            if record["created_at"] < cutoff
        ]
        for task_id in expired:
            _video_task_results.pop(task_id, None)


# ---------------------------------------------------------------------------
# Image overlay (merge extracted foreground with a new background)
# ---------------------------------------------------------------------------

_overlay_task_results: Dict[str, Dict[str, Any]] = {}
_overlay_result_lock = threading.Lock()


def overlay_image(job_store: JobStore, processed_file_id: str, bg_data: bytes, bg_filename: str) -> str:
    task_id = _new_task_id("bgoverlay")
    progress_store.set_progress(task_id, "starting", 0, "Starting image overlay...")

    def runner() -> None:
        try:
            if not _deps_available or Image is None:
                progress_store.set_progress(task_id, "error", 0, "PIL not installed")
                return

            progress_store.set_progress(task_id, "preparing", 20, "Loading foreground image...")
            fg_file = job_store.get_file(processed_file_id)
            if not fg_file:
                progress_store.set_progress(task_id, "error", 0, "Foreground image not found")
                return
            fg_image = Image.open(fg_file.path).convert("RGBA")

            progress_store.set_progress(task_id, "preparing", 45, "Loading background image...")
            bg_image = Image.open(io.BytesIO(bg_data)).convert("RGBA")
            bg_image = bg_image.resize(fg_image.size, Image.LANCZOS)

            progress_store.set_progress(task_id, "processing", 70, "Compositing images...")
            result = Image.new("RGBA", fg_image.size)
            result.paste(bg_image, (0, 0))
            result.paste(fg_image, (0, 0), mask=fg_image)

            progress_store.set_progress(task_id, "saving", 88, "Saving result...")
            stamp = int(time.time())
            unique = uuid.uuid4().hex[:8]
            base = Path(bg_filename or "overlay").stem or "overlay"
            result_filename = f"{base}_{stamp}_{unique}_overlay.png"
            result_path = _save_png(result, result_filename)
            result_record = job_store.add_file(result_path, result_filename)

            with _overlay_result_lock:
                _overlay_task_results[task_id] = {
                    "created_at": time.time(),
                    "filename": result_filename,
                    "file_id": result_record.file_id,
                }
            progress_store.set_progress(task_id, "complete", 100, "Overlay complete!")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Image overlay failed: {exc}", "error", log_name="bg-remove-overlay.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_overlay_result(task_id: str) -> Optional[dict]:
    with _overlay_result_lock:
        record = _overlay_task_results.get(task_id)
    if not record:
        return None
    return {
        "status": "success",
        "filename": record["filename"],
        "merged_url": f"/api/v1/files/{record['file_id']}",
        "download_url": f"/api/v1/files/{record['file_id']}?download=1",
    }


def cleanup_overlay_results() -> None:
    cutoff = time.time() - RESULT_RETENTION_SECONDS
    with _overlay_result_lock:
        expired = [k for k, v in _overlay_task_results.items() if v["created_at"] < cutoff]
        for k in expired:
            _overlay_task_results.pop(k, None)


# ---------------------------------------------------------------------------
# Video overlay (merge extracted subject video with a new background image/video)
# ---------------------------------------------------------------------------

_video_overlay_task_results: Dict[str, Dict[str, Any]] = {}
_video_overlay_result_lock = threading.Lock()


def overlay_video(
    job_store: JobStore,
    subject_file_id: str,
    mask_file_id: str,
    bg_data: bytes,
    bg_filename: str,
) -> str:
    task_id = _new_task_id("bgovl")
    progress_store.set_progress(task_id, "starting", 0, "Starting video overlay...")

    def runner() -> None:
        bg_path: Optional[Path] = None
        try:
            if not _video_deps_available or cv2 is None or np is None:
                progress_store.set_progress(task_id, "error", 0, "Required libraries not installed (opencv-python).")
                return

            progress_store.set_progress(task_id, "preparing", 5, "Opening subject video...")
            subject_file = job_store.get_file(subject_file_id)
            mask_file = job_store.get_file(mask_file_id)
            if not subject_file or not mask_file:
                progress_store.set_progress(task_id, "error", 0, "Source video files not found")
                return

            cap_subject = cv2.VideoCapture(str(subject_file.path))
            cap_mask = cv2.VideoCapture(str(mask_file.path))
            if not cap_subject.isOpened() or not cap_mask.isOpened():
                progress_store.set_progress(task_id, "error", 0, "Cannot open video files")
                return

            fps = cap_subject.get(cv2.CAP_PROP_FPS) or 25.0
            total_frames = int(cap_subject.get(cv2.CAP_PROP_FRAME_COUNT))
            h = int(cap_subject.get(cv2.CAP_PROP_FRAME_HEIGHT))
            w = int(cap_subject.get(cv2.CAP_PROP_FRAME_WIDTH))

            bg_ext = Path(bg_filename).suffix.lower()
            bg_is_video = bg_ext in SUPPORTED_VIDEO_EXTS
            cap_bg = None
            bg_image_np = None

            if bg_is_video:
                unique_bg = uuid.uuid4().hex
                bg_path = _save_video_bytes(bg_data, f"tmp_bgvid_{unique_bg}{bg_ext}")
                cap_bg = cv2.VideoCapture(str(bg_path))
                if not cap_bg.isOpened():
                    cap_subject.release()
                    cap_mask.release()
                    progress_store.set_progress(task_id, "error", 0, "Cannot open background video")
                    return
            else:
                if not _deps_available or Image is None:
                    cap_subject.release()
                    cap_mask.release()
                    progress_store.set_progress(task_id, "error", 0, "PIL not installed")
                    return
                bg_pil = Image.open(io.BytesIO(bg_data)).convert("RGB").resize((w, h), Image.LANCZOS)
                bg_image_np = cv2.cvtColor(np.array(bg_pil), cv2.COLOR_RGB2BGR)

            stamp = int(time.time())
            unique = uuid.uuid4().hex[:8]
            base = Path(bg_filename or "overlay").stem or "overlay"
            result_filename = f"{base}_{stamp}_{unique}_overlay.mp4"
            result_path = TEMP_DIR / result_filename
            TEMP_DIR.mkdir(parents=True, exist_ok=True)

            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(result_path), fourcc, fps, (w, h), isColor=True)

            frame_idx = 0
            while True:
                ret_s, subject_bgr = cap_subject.read()
                ret_m, mask_frame = cap_mask.read()
                if not ret_s:
                    break

                if ret_m:
                    if len(mask_frame.shape) == 3:
                        mask_gray = cv2.cvtColor(mask_frame, cv2.COLOR_BGR2GRAY)
                    else:
                        mask_gray = mask_frame
                    alpha = mask_gray.astype(np.float32) / 255.0
                else:
                    alpha = np.ones((h, w), dtype=np.float32)

                if cap_bg is not None:
                    ret_bg, bg_frame = cap_bg.read()
                    if not ret_bg:
                        cap_bg.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret_bg, bg_frame = cap_bg.read()
                    bg_frame = cv2.resize(bg_frame, (w, h)) if ret_bg else np.zeros((h, w, 3), dtype=np.uint8)
                else:
                    bg_frame = bg_image_np.copy()

                # subject_bgr = fg * alpha (premultiplied); composite = fg*alpha + bg*(1-alpha)
                alpha_3 = alpha[:, :, np.newaxis]
                composite = np.clip(
                    subject_bgr.astype(np.float32) + bg_frame.astype(np.float32) * (1.0 - alpha_3),
                    0, 255,
                ).astype(np.uint8)
                writer.write(composite)

                frame_idx += 1
                pct = int(10 + (frame_idx / total_frames) * 80) if total_frames > 0 else min(10 + frame_idx, 89)
                progress_store.set_progress(task_id, "processing", pct, f"Compositing frame {frame_idx}/{total_frames}...")

            cap_subject.release()
            cap_mask.release()
            if cap_bg is not None:
                cap_bg.release()
            writer.release()

            if bg_path:
                try:
                    bg_path.unlink(missing_ok=True)
                except Exception:
                    pass

            progress_store.set_progress(task_id, "saving", 95, "Saving result...")
            result_record = job_store.add_file(result_path, result_filename)

            with _video_overlay_result_lock:
                _video_overlay_task_results[task_id] = {
                    "created_at": time.time(),
                    "filename": result_filename,
                    "file_id": result_record.file_id,
                    "frames_processed": frame_idx,
                }
            progress_store.set_progress(task_id, "complete", 100, f"Overlay complete! {frame_idx} frames processed.")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Video overlay failed: {exc}", "error", log_name="bg-remove-overlay.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def get_video_overlay_result(task_id: str) -> Optional[dict]:
    with _video_overlay_result_lock:
        record = _video_overlay_task_results.get(task_id)
    if not record:
        return None
    return {
        "status": "success",
        "filename": record["filename"],
        "frames_processed": record["frames_processed"],
        "merged_url": f"/api/v1/files/{record['file_id']}",
        "download_url": f"/api/v1/files/{record['file_id']}?download=1",
    }


def cleanup_video_overlay_results() -> None:
    cutoff = time.time() - RESULT_RETENTION_SECONDS
    with _video_overlay_result_lock:
        expired = [k for k, v in _video_overlay_task_results.items() if v["created_at"] < cutoff]
        for k in expired:
            _video_overlay_task_results.pop(k, None)


# ---------------------------------------------------------------------------
# Audio muxing helper
# ---------------------------------------------------------------------------


def _mux_audio_into_video(video_path: Path, audio_path: Path, output_path: Path) -> bool:
    """Use FFmpeg to mux an audio track into a silent video.

    The output is trimmed to the shorter of the two streams (-shortest).
    Returns True on success, False if FFmpeg is unavailable or fails.
    """
    import shutil
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log("FFmpeg not found on PATH — audio will not be added", "warning", log_name="bg-remove-overlay.log")
        return False
    try:
        result = subprocess.run(
            [
                ffmpeg, "-y",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                str(output_path),
            ],
            capture_output=True,
            timeout=600,
        )
        if result.returncode != 0:
            log(f"FFmpeg mux failed: {result.stderr.decode(errors='replace')}", "error", log_name="bg-remove-overlay.log")
        return result.returncode == 0
    except Exception as exc:
        log(f"FFmpeg mux exception: {exc}", "error", log_name="bg-remove-overlay.log")
        return False


# ---------------------------------------------------------------------------
# Standalone overlay — accepts raw file bytes (no job_store file IDs needed)
# ---------------------------------------------------------------------------


def overlay_image_upload(
    job_store: JobStore,
    fg_data: bytes,
    fg_filename: str,
    bg_data: bytes,
    bg_filename: str,
) -> str:
    """Merge a foreground RGBA image with a background image from raw bytes."""
    task_id = _new_task_id("bgoverlay")
    progress_store.set_progress(task_id, "starting", 0, "Starting image overlay...")

    def runner() -> None:
        try:
            if not _deps_available or Image is None:
                progress_store.set_progress(task_id, "error", 0, "PIL not installed")
                return

            progress_store.set_progress(task_id, "preparing", 20, "Loading foreground image...")
            fg_image = Image.open(io.BytesIO(fg_data)).convert("RGBA")

            progress_store.set_progress(task_id, "preparing", 45, "Loading background image...")
            bg_image = Image.open(io.BytesIO(bg_data)).convert("RGBA")
            bg_image = bg_image.resize(fg_image.size, Image.LANCZOS)

            progress_store.set_progress(task_id, "processing", 70, "Compositing images...")
            result = Image.new("RGBA", fg_image.size)
            result.paste(bg_image, (0, 0))
            result.paste(fg_image, (0, 0), mask=fg_image)

            progress_store.set_progress(task_id, "saving", 88, "Saving result...")
            stamp = int(time.time())
            unique = uuid.uuid4().hex[:8]
            base = Path(fg_filename or "overlay").stem or "overlay"
            result_filename = f"{base}_{stamp}_{unique}_overlay.png"
            result_path = _save_png(result, result_filename)
            result_record = job_store.add_file(result_path, result_filename)

            with _overlay_result_lock:
                _overlay_task_results[task_id] = {
                    "created_at": time.time(),
                    "filename": result_filename,
                    "file_id": result_record.file_id,
                }
            progress_store.set_progress(task_id, "complete", 100, "Overlay complete!")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Image overlay (upload) failed: {exc}", "error", log_name="bg-remove-overlay.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def overlay_video_upload(
    job_store: JobStore,
    subject_data: bytes,
    subject_filename: str,
    mask_data: Optional[bytes],
    mask_filename: Optional[str],
    bg_data: bytes,
    bg_filename: str,
    audio_data: Optional[bytes] = None,
    audio_filename: Optional[str] = None,
) -> str:
    """Merge a subject video with an optional mask video and a background image/video from raw bytes.
    Optionally mux an audio track into the final video using FFmpeg.
    """
    task_id = _new_task_id("bgovl")
    progress_store.set_progress(task_id, "starting", 0, "Starting video overlay...")

    def runner() -> None:
        subject_path: Optional[Path] = None
        mask_path: Optional[Path] = None
        bg_path: Optional[Path] = None
        try:
            if not _video_deps_available or cv2 is None or np is None:
                progress_store.set_progress(task_id, "error", 0, "Required libraries not installed (opencv-python).")
                return

            # Save subject video to temp
            unique_s = uuid.uuid4().hex
            sub_ext = Path(subject_filename or "subject.mp4").suffix.lower()
            if sub_ext not in SUPPORTED_VIDEO_EXTS:
                sub_ext = ".mp4"
            subject_path = _save_video_bytes(subject_data, f"tmp_subj_{unique_s}{sub_ext}")

            progress_store.set_progress(task_id, "preparing", 5, "Opening subject video...")
            cap_subject = cv2.VideoCapture(str(subject_path))
            if not cap_subject.isOpened():
                progress_store.set_progress(task_id, "error", 0, "Cannot open subject video")
                return

            fps = cap_subject.get(cv2.CAP_PROP_FPS) or 25.0
            total_frames = int(cap_subject.get(cv2.CAP_PROP_FRAME_COUNT))
            h = int(cap_subject.get(cv2.CAP_PROP_FRAME_HEIGHT))
            w = int(cap_subject.get(cv2.CAP_PROP_FRAME_WIDTH))

            # Optional mask video
            cap_mask = None
            if mask_data:
                unique_m = uuid.uuid4().hex
                msk_ext = Path(mask_filename or "mask.mp4").suffix.lower()
                if msk_ext not in SUPPORTED_VIDEO_EXTS:
                    msk_ext = ".mp4"
                mask_path = _save_video_bytes(mask_data, f"tmp_mask_{unique_m}{msk_ext}")
                cap_mask = cv2.VideoCapture(str(mask_path))
                if not cap_mask.isOpened():
                    cap_mask = None

            # Background
            bg_ext = Path(bg_filename).suffix.lower()
            bg_is_video = bg_ext in SUPPORTED_VIDEO_EXTS
            cap_bg = None
            bg_image_np = None

            if bg_is_video:
                unique_bg = uuid.uuid4().hex
                bg_path = _save_video_bytes(bg_data, f"tmp_bgvid_{unique_bg}{bg_ext}")
                cap_bg = cv2.VideoCapture(str(bg_path))
                if not cap_bg.isOpened():
                    cap_subject.release()
                    if cap_mask:
                        cap_mask.release()
                    progress_store.set_progress(task_id, "error", 0, "Cannot open background video")
                    return
            else:
                if not _deps_available or Image is None:
                    cap_subject.release()
                    if cap_mask:
                        cap_mask.release()
                    progress_store.set_progress(task_id, "error", 0, "PIL not installed")
                    return
                bg_pil = Image.open(io.BytesIO(bg_data)).convert("RGB").resize((w, h), Image.LANCZOS)
                bg_image_np = cv2.cvtColor(np.array(bg_pil), cv2.COLOR_RGB2BGR)

            stamp = int(time.time())
            unique = uuid.uuid4().hex[:8]
            base = Path(subject_filename or "overlay").stem or "overlay"
            result_filename = f"{base}_{stamp}_{unique}_overlay.mp4"
            result_path = TEMP_DIR / result_filename
            TEMP_DIR.mkdir(parents=True, exist_ok=True)

            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(result_path), fourcc, fps, (w, h), isColor=True)

            frame_idx = 0
            while True:
                ret_s, subject_bgr = cap_subject.read()
                if not ret_s:
                    break

                if cap_mask is not None:
                    ret_m, mask_frame = cap_mask.read()
                    if ret_m:
                        if len(mask_frame.shape) == 3:
                            mask_gray = cv2.cvtColor(mask_frame, cv2.COLOR_BGR2GRAY)
                        else:
                            mask_gray = mask_frame
                        alpha = mask_gray.astype(np.float32) / 255.0
                    else:
                        alpha = np.ones((h, w), dtype=np.float32)
                else:
                    # No mask: treat all non-black pixels as fully opaque foreground
                    gray = cv2.cvtColor(subject_bgr, cv2.COLOR_BGR2GRAY)
                    _, bin_mask = cv2.threshold(gray, 5, 255, cv2.THRESH_BINARY)
                    alpha = bin_mask.astype(np.float32) / 255.0

                if cap_bg is not None:
                    ret_bg, bg_frame = cap_bg.read()
                    if not ret_bg:
                        cap_bg.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret_bg, bg_frame = cap_bg.read()
                    bg_frame = cv2.resize(bg_frame, (w, h)) if ret_bg else np.zeros((h, w, 3), dtype=np.uint8)
                else:
                    bg_frame = bg_image_np.copy()

                alpha_3 = alpha[:, :, np.newaxis]
                composite = np.clip(
                    subject_bgr.astype(np.float32) + bg_frame.astype(np.float32) * (1.0 - alpha_3),
                    0, 255,
                ).astype(np.uint8)
                writer.write(composite)

                frame_idx += 1
                pct = int(10 + (frame_idx / total_frames) * 80) if total_frames > 0 else min(10 + frame_idx, 89)
                progress_store.set_progress(task_id, "processing", pct, f"Compositing frame {frame_idx}/{total_frames}...")

            cap_subject.release()
            if cap_mask:
                cap_mask.release()
            if cap_bg:
                cap_bg.release()
            writer.release()

            for p in [subject_path, mask_path, bg_path]:
                if p:
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass

            # Optional audio muxing via FFmpeg
            audio_path: Optional[Path] = None
            if audio_data:
                progress_store.set_progress(task_id, "muxing", 92, "Muxing audio into video...")
                audio_ext = Path(audio_filename or "audio.mp3").suffix.lower()
                if audio_ext not in SUPPORTED_AUDIO_EXTS:
                    audio_ext = ".mp3"
                unique_a = uuid.uuid4().hex
                audio_path = _save_video_bytes(audio_data, f"tmp_audio_{unique_a}{audio_ext}")
                muxed_filename = result_filename.replace(".mp4", "_audio.mp4")
                muxed_path = TEMP_DIR / muxed_filename
                if _mux_audio_into_video(result_path, audio_path, muxed_path):
                    try:
                        result_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                    result_path = muxed_path
                    result_filename = muxed_filename
                try:
                    audio_path.unlink(missing_ok=True)
                except Exception:
                    pass

            progress_store.set_progress(task_id, "saving", 95, "Saving result...")
            result_record = job_store.add_file(result_path, result_filename)

            with _video_overlay_result_lock:
                _video_overlay_task_results[task_id] = {
                    "created_at": time.time(),
                    "filename": result_filename,
                    "file_id": result_record.file_id,
                    "frames_processed": frame_idx,
                }
            progress_store.set_progress(task_id, "complete", 100, f"Overlay complete! {frame_idx} frames processed.")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Video overlay (upload) failed: {exc}", "error", log_name="bg-remove-overlay.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id
