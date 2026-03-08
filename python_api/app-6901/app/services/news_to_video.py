from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR
from python_api.common.progress import ProgressStore

from .aenv_profile_service_api import get_remotion_setup_status  # noqa: F401 – re-exported

# ── Constants ─────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[4]
REMOTION_ROOT = REPO_ROOT / "remotion"
REMOTION_PUBLIC_MAIN = REMOTION_ROOT / "public" / "main"
PREVIEW_STAGING_ROOT = REMOTION_PUBLIC_MAIN / "news"
PREVIEW_IMAGE_DIR = REMOTION_PUBLIC_MAIN / "news" / "image"
STUDIO_PORT = 3100

USER_ASSETS_DIR = REMOTION_ROOT / "public" / "user-assets"

RENDER_CONCURRENCY = 4
RETENTION_SECONDS = 60 * 60

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
ALLOWED_AUDIO_SUFFIXES = {".wav"}

_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)%")

# ── Studio process management ─────────────────────────────────────────────────

_studio_proc: subprocess.Popen | None = None
_studio_lock = threading.Lock()


def start_studio() -> dict[str, object]:
    """Start the Remotion Studio process on STUDIO_PORT. No-op if already running."""
    global _studio_proc
    with _studio_lock:
        if _studio_proc is not None and _studio_proc.poll() is None:
            return {"running": True, "message": "Studio already running"}

        _studio_proc = subprocess.Popen(
            ["npx", "remotion", "studio", "--port", str(STUDIO_PORT)],
            cwd=str(REMOTION_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"running": True, "message": f"Studio started on port {STUDIO_PORT}"}


def stop_studio() -> dict[str, object]:
    """Stop the Remotion Studio process if running."""
    global _studio_proc
    with _studio_lock:
        if _studio_proc is None or _studio_proc.poll() is not None:
            _studio_proc = None
            return {"running": False, "message": "Studio not running"}
        _studio_proc.terminate()
        try:
            _studio_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _studio_proc.kill()
        _studio_proc = None
        return {"running": False, "message": "Studio stopped"}


def get_studio_status() -> dict[str, object]:
    """Return whether the Remotion Studio process is currently running."""
    with _studio_lock:
        running = _studio_proc is not None and _studio_proc.poll() is None
        return {"running": running}

# ── Template definitions ───────────────────────────────────────────────────────
# Keys prefixed with _ are service-internal (not written to the staged video-config).
# All other keys are written verbatim to the staged video-config JSON.

TEMPLATES: dict[str, dict] = {
    "NewsVerticalBackground": {
        "_composition": "NewsVerticalBackground",
        "_config_filename": "video-config-vertical-bg.json",
        "_uses_hero": False,
        "introDurationInFrames": 150,
        "imageDurationInFrames": 170,
        "backgroundOverlayImage": "templates/news-intro-vertical/bottom2.png",
        "introProps": {
            "image1": "templates/news-intro-vertical/top.png",
            "image2": "templates/news-intro-vertical/bottom.png",
            "heroImage": "templates/news-intro-vertical/hero.png",
        },
    },
    "NewsVerticalNoBackground": {
        "_composition": "NewsVerticalNoBackground",
        "_config_filename": "video-config-vertical-nobg.json",
        "_uses_hero": False,
        "introDurationInFrames": 150,
        "imageDurationInFrames": 170,
        "overlayImage": "templates/news-overlay/vertical-logo-only1.png",
        "introProps": {
            "image1": "templates/news-intro-vertical/top.png",
            "image2": "templates/news-intro-vertical/bottom.png",
            "heroImage": "templates/news-intro-vertical/hero.png",
        },
    },
    "NewsHorizontalBackground": {
        "_composition": "NewsHorizontalBackground",
        "_config_filename": "video-config-horizontal-bg.json",
        "_uses_hero": True,
        "introDurationInFrames": 150,
        "imageDurationInFrames": 170,
        "backgroundOverlayImage": "templates/news-intro-horizontal/right2.png",
        "introProps": {
            "image1": "templates/news-intro-horizontal/left.png",
            "image2": "templates/news-intro-horizontal/right2.png",
            "heroImage": "templates/news-intro-horizontal/hero.png",
        },
    },
    "NewsHorizontalNoBackground": {
        "_composition": "NewsHorizontalNoBackground",
        "_config_filename": "video-config-horizontal-nobg.json",
        "_uses_hero": False,
        "introDurationInFrames": 150,
        "imageDurationInFrames": 170,
        "overlayImage": "templates/news-overlay/horizontal-logo-only1.png",
        "introProps": {
            "image1": "templates/news-intro-horizontal/left.png",
            "image2": "templates/news-intro-horizontal/right.png",
            "heroImage": "templates/news-intro-horizontal/hero.png",
        },
    },
    "NewsHorizontalBackgroundCNN": {
        "_composition": "NewsHorizontalBackgroundCNN",
        "_config_filename": "video-config-horizontal-cnn.json",
        "_uses_hero": False,
        "introDurationInFrames": 0,
        "imageDurationInFrames": 170,
        "captionBottomPercent": 2.9,
        "overlayImage": "templates/news-overlay/horizontal-bg2.png",
        "introProps": {
            "image1": "templates/news-intro-horizontal/left.png",
            "image2": "templates/news-intro-horizontal/right.png",
            "heroImage": "templates/news-intro-horizontal/hero.png",
        },
    },
}

# Internal-only keys — excluded when writing the staged video-config JSON
_INTERNAL_KEYS = {"_composition", "_config_filename", "_uses_hero"}

# ── In-memory state ───────────────────────────────────────────────────────────

render_progress_store = ProgressStore()

_render_results: dict[str, dict[str, object]] = {}
_state_lock = threading.Lock()


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class UploadedFileData:
    filename: str
    content_type: str | None
    data: bytes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _resolve_image_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in ALLOWED_IMAGE_SUFFIXES else ".jpg"


def _validate_image(upload: UploadedFileData, field_name: str) -> None:
    suffix = Path(upload.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise RuntimeError(f"{field_name}: unsupported image extension '{suffix or '<none>'}'")
    if not upload.data:
        raise RuntimeError(f"{field_name} is empty")


def _validate_audio(upload: UploadedFileData, field_name: str) -> None:
    suffix = Path(upload.filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise RuntimeError(f"{field_name} must be a .wav file")
    if not upload.data:
        raise RuntimeError(f"{field_name} is empty")


def _build_staging_config(template_key: str, overrides: dict | None = None) -> dict:
    """Return the video-config dict to write for the given template (internal keys excluded).

    ``overrides`` values are merged on top of template defaults before writing.
    """
    config = {k: v for k, v in TEMPLATES[template_key].items() if k not in _INTERNAL_KEYS}
    if overrides:
        config.update(overrides)
    return config


def _normalize_asset_path(path: str, staging_root: Path) -> str:
    """Convert an absolute filesystem path to a Remotion-public-relative path.

    - If already relative, return as-is.
    - If absolute and within remotion/public, compute the relative path from there.
    - If absolute and outside remotion/public, copy the file into staging_root/assets/
      and return the Remotion-public-relative path to the copy.
    """
    p = Path(path)
    if not p.is_absolute():
        return path

    public_root = REMOTION_ROOT / "public"
    try:
        rel = p.relative_to(public_root)
        return rel.as_posix()
    except ValueError:
        pass

    if not p.exists():
        raise RuntimeError(f"Asset file not found: {path}")

    assets_dir = staging_root / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    dest = assets_dir / p.name
    shutil.copy2(str(p), str(dest))
    staging_rel = staging_root.relative_to(public_root)
    return (staging_rel / "assets" / p.name).as_posix()


def _normalize_config_paths(config: dict, staging_root: Path) -> dict:
    """Walk config dict and normalize any absolute paths in asset fields."""
    result = dict(config)

    for field in ("backgroundOverlayImage", "overlayImage"):
        if field in result and isinstance(result[field], str):
            result[field] = _normalize_asset_path(result[field], staging_root)

    if "introProps" in result and isinstance(result["introProps"], dict):
        intro = dict(result["introProps"])
        for key in ("image1", "image2", "heroImage"):
            if key in intro and isinstance(intro[key], str):
                intro[key] = _normalize_asset_path(intro[key], staging_root)
        result["introProps"] = intro

    return result


def _stage_files(
    staging_root: Path,
    template_key: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict | None = None,
) -> None:
    """Stage all uploaded files + config into the Remotion public staging directory."""
    template = TEMPLATES[template_key]

    audio_dir = staging_root / "audio"
    image_dir = staging_root / "image"
    config_dir = staging_root / "config"
    audio_dir.mkdir(parents=True, exist_ok=True)
    config_dir.mkdir(parents=True, exist_ok=True)

    # Clear and recreate image dir to avoid stale images from previous uploads
    if image_dir.exists():
        shutil.rmtree(image_dir)
    image_dir.mkdir(parents=True)

    # Audio + transcript
    (audio_dir / "narration.wav").write_bytes(audio.data)
    transcript_payload: dict = json.loads(transcript.data.decode("utf-8-sig"))
    (audio_dir / "narration.json").write_text(
        json.dumps(transcript_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Slideshow images — named 01, 02, … for deterministic ordering
    for idx, img in enumerate(images, start=1):
        suffix = _resolve_image_suffix(img.filename)
        (image_dir / f"{idx:02d}{suffix}").write_bytes(img.data)

    # Hero image — saved to staging dir AND to the shared preview/image dir
    # (NewsHorizontalBackground reads hero from main/news/image/hero.png directly)
    if hero_image:
        hero_suffix = _resolve_image_suffix(hero_image.filename)
        hero_dest = image_dir / f"hero{hero_suffix}"
        hero_dest.write_bytes(hero_image.data)
        # Also overwrite the shared preview hero so the hardcoded path in the component works
        PREVIEW_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        (PREVIEW_IMAGE_DIR / "hero.png").write_bytes(hero_image.data)

    # Video config — built from the TEMPLATES dict, merged with any user overrides
    config = _build_staging_config(template_key, overrides)
    config = _normalize_config_paths(config, staging_root)
    (config_dir / template["_config_filename"]).write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── State management ──────────────────────────────────────────────────────────

def _set_render_result(task_id: str, payload: dict[str, object]) -> None:
    with _state_lock:
        _render_results[task_id] = payload


def get_render_result(task_id: str) -> dict[str, object] | None:
    with _state_lock:
        return _render_results.get(task_id)


def _cleanup_expired() -> None:
    cutoff = time.time() - RETENTION_SECONDS
    with _state_lock:
        expired = [
            tid for tid, p in _render_results.items()
            if isinstance(p.get("created_at"), (int, float)) and float(p["created_at"]) < cutoff
        ]
        for tid in expired:
            _render_results.pop(tid, None)


def cleanup_news_to_video_state() -> None:
    _cleanup_expired()


# ── User-asset upload ─────────────────────────────────────────────────────────

def upload_user_asset(upload: UploadedFileData) -> str:
    """Save an uploaded image to remotion/public/user-assets/ and return its relative path."""
    _validate_image(upload, "file")
    suffix = _resolve_image_suffix(upload.filename)
    stem = Path(upload.filename).stem
    filename = f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"
    USER_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    (USER_ASSETS_DIR / filename).write_bytes(upload.data)
    return f"user-assets/{filename}"


# ── Preview staging ───────────────────────────────────────────────────────────

def stage_preview(
    template_key: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict | None = None,
) -> dict[str, object]:
    """Stage files into the shared preview directory for Remotion Studio viewing."""
    if template_key not in TEMPLATES:
        raise RuntimeError(f"Unknown template '{template_key}'")

    for idx, img in enumerate(images):
        _validate_image(img, f"images[{idx}]")
    _validate_audio(audio, "audio_file")

    _stage_files(
        staging_root=PREVIEW_STAGING_ROOT,
        template_key=template_key,
        audio=audio,
        transcript=transcript,
        images=images,
        hero_image=hero_image,
        overrides=overrides,
    )

    return {
        "content_directory": "main/news",
        "studio_url": f"http://localhost:{STUDIO_PORT}",
    }


# ── Render pipeline ───────────────────────────────────────────────────────────

def start_render_pipeline(
    job_store: JobStore,
    template_key: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict | None = None,
) -> str:
    _cleanup_expired()

    if template_key not in TEMPLATES:
        raise RuntimeError(f"Unknown template '{template_key}'")
    if not (REMOTION_ROOT / "render-news.js").exists():
        raise RuntimeError("render-news.js not found in remotion directory")
    if not (REMOTION_ROOT / "node_modules" / "@remotion").exists():
        raise RuntimeError(
            "Remotion npm dependencies not installed. "
            "Please go to Settings → Remotion Setup and click 'npm install'."
        )

    task_id = _new_id("n2v_render")
    render_progress_store.set_progress(task_id, "starting", 0, "Starting News-to-Video render...")

    composition = TEMPLATES[template_key]["_composition"]

    def runner() -> None:
        content_dir_name = f"n2v_{task_id}"
        staging_root = REMOTION_PUBLIC_MAIN / content_dir_name
        try:
            render_progress_store.set_progress(task_id, "processing", 5, "Staging assets...")
            _stage_files(
                staging_root=staging_root,
                template_key=template_key,
                audio=audio,
                transcript=transcript,
                images=images,
                hero_image=hero_image,
                overrides=overrides,
            )

            output_path = TEMP_DIR / f"n2v_video_{task_id}.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            if output_path.exists():
                output_path.unlink()

            cmd = [
                "node",
                "render-news.js",
                "--composition", composition,
                "--content", f"main/{content_dir_name}",
                "--output", str(output_path),
                "--concurrency", str(RENDER_CONCURRENCY),
            ]

            render_progress_store.set_progress(task_id, "processing", 15, "Starting Remotion render...")
            process = subprocess.Popen(
                cmd,
                cwd=str(REMOTION_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            if process.stdout is None:
                raise RuntimeError("Failed to capture render output")

            for raw_line in process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                render_progress_store.add_log(task_id, line)
                match = _PERCENT_RE.search(line)
                if match:
                    try:
                        pct = float(match.group(1))
                        mapped = 15 + int(max(0.0, min(100.0, pct)) * 0.80)
                        render_progress_store.set_progress(task_id, "processing", min(mapped, 95), "Rendering video...")
                    except ValueError:
                        pass

            rc = process.wait()
            if rc != 0:
                raise RuntimeError(f"Remotion render failed with exit code {rc}")
            if not output_path.exists():
                raise RuntimeError("Rendered video file was not produced")

            video_file = job_store.add_file(output_path, output_path.name)
            download_url = f"/api/v1/files/{video_file.file_id}"
            _set_render_result(
                task_id,
                {
                    "created_at": time.time(),
                    "video": {"filename": video_file.filename, "download_url": download_url},
                    "preview_url": download_url,
                },
            )
            render_progress_store.set_progress(task_id, "complete", 100, "Video render complete.")
        except Exception as exc:
            render_progress_store.add_log(task_id, f"[ERROR] {exc}")
            render_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"News-to-video render failed: {exc}", "error", log_name="app-service.log")
        finally:
            if staging_root.exists():
                shutil.rmtree(staging_root, ignore_errors=True)

    threading.Thread(target=runner, daemon=True).start()
    return task_id
