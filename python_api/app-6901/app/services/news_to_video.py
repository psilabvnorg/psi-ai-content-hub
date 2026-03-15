from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import httpx

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

USER_ASSETS_DIR = TEMP_DIR / "user-assets"
USER_ASSETS_BASE_URL = "http://localhost:6901/user-assets"

RENDER_CONCURRENCY = 4
RETENTION_SECONDS = 60 * 60

RENDER_PROFILES: dict[str, dict[str, str | int]] = {
    "tiktok": {
        "crf": 18,
        "pixel_format": "yuv420p",
        "audio_codec": "aac",
        "audio_bitrate": "192k",
    },
    "youtube": {
        "crf": 16,
        "pixel_format": "yuv420p",
        "audio_codec": "aac",
        "audio_bitrate": "320k",
    },
}

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

        npx_cmd = shutil.which("npx") or ("npx.cmd" if sys.platform == "win32" else "npx")
        _studio_proc = subprocess.Popen(
            [npx_cmd, "remotion", "studio", "--port", str(STUDIO_PORT)],
            cwd=str(REMOTION_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=(sys.platform == "win32"),
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

# ── Quick-template definitions ─────────────────────────────────────────────────
# Each entry maps a short template ID to the Remotion-relative paths for its
# pre-made hero image, background overlay, and default background music.

QUICK_TEMPLATES: dict[str, dict[str, str | None]] = {
    "dff": {
        "hero":               "main/news/template-vertical-background/dff/hero.png",
        "bg":                 "main/news/template-vertical-background/dff/bg-overlay.png",
        "music":              "background-music/review-film.mp3",
        "thumbnail_template": "DFF",
    },
    "theanh-28": {
        "hero":               "main/news/template-vertical-background/theanh-28/hero.png",
        "bg":                 "main/news/template-vertical-background/theanh-28/bg-overlay.png",
        "music":              "background-music/review-film.mp3",
        "thumbnail_template": "THE ANH 28",
    },
    "youtube-news1": {
        "hero":               "main/news/template-vertical-background/youtube-news1/hero.png",
        "bg":                 "main/news/template-vertical-background/youtube-news1/bg-overlay.png",
        "music":              "background-music/review-film.mp3",
        "thumbnail_template": "YOUTUBE CNN NEWS",
    },
    "youtube-news2": {
        "hero":               "main/news/template-vertical-background/youtube-news2/hero.png",
        "bg":                 "main/news/template-vertical-background/youtube-news2/bg-overlay.png",
        "music":              "background-music/review-film.mp3",
        "thumbnail_template": "YOUTUBE NEWS2",
    },
}

# ── In-memory state ───────────────────────────────────────────────────────────

render_progress_store = ProgressStore()

_render_results: dict[str, dict[str, object]] = {}
_state_lock = threading.Lock()

quick_generate_progress_store = ProgressStore()

_quick_generate_results: dict[str, dict[str, object]] = {}
_quick_state_lock = threading.Lock()


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class UploadedFileData:
    filename: str
    content_type: str | None
    data: bytes


def load_file_from_path(path: str, field_name: str) -> UploadedFileData:
    """Load a local file into UploadedFileData (for server-side automation)."""
    p = Path(path)
    if not p.exists() or not p.is_file():
        raise RuntimeError(f"{field_name}: file not found at '{path}'")
    return UploadedFileData(filename=p.name, content_type=None, data=p.read_bytes())


def load_images_from_folder(folder_path: str, field_name: str = "slider_image_paths") -> list[UploadedFileData]:
    """Load all supported images from a folder, sorted by filename, max 10."""
    p = Path(folder_path)
    if not p.exists() or not p.is_dir():
        raise RuntimeError(f"{field_name}: folder not found at '{folder_path}'")
    files = sorted(
        f for f in p.iterdir()
        if f.is_file() and f.suffix.lower() in ALLOWED_IMAGE_SUFFIXES
    )
    if not files:
        raise RuntimeError(f"{field_name}: no supported images found in '{folder_path}'")
    if len(files) > 10:
        files = files[:10]
    return [UploadedFileData(filename=f.name, content_type=None, data=f.read_bytes()) for f in files]


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


def _normalize_asset_path(path: str) -> str:
    """Resolve an asset path to a form Remotion can access.

    Resolution order:
    1. HTTP/HTTPS URL → return as-is (Remotion fetches it directly).
    2. Relative path → return as-is (resolved against remotion/public at runtime).
    3. Absolute path within remotion/public → return the public-relative path.
    4. Absolute local path outside remotion/public → copy the file into
       USER_ASSETS_DIR and return its HTTP URL so Remotion can fetch it.
    """
    if path.startswith("http://") or path.startswith("https://"):
        return path

    p = Path(path)
    if not p.is_absolute():
        return path

    public_root = REMOTION_ROOT / "public"
    try:
        return p.relative_to(public_root).as_posix()
    except ValueError:
        pass

    if not p.exists():
        raise RuntimeError(f"Asset file not found: '{path}'")

    suffix = p.suffix.lower() or ".jpg"
    dest_name = f"{p.stem}_{uuid.uuid4().hex[:8]}{suffix}"
    USER_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(p), str(USER_ASSETS_DIR / dest_name))
    return f"{USER_ASSETS_BASE_URL}/{dest_name}"


def _normalize_config_paths(config: dict) -> dict:
    """Walk config dict and normalize any local/absolute paths in asset fields.

    Handles ``backgroundOverlayImage``, ``overlayImage``, and all ``introProps``
    image keys.  HTTP URLs and remotion-public-relative paths are left unchanged.
    """
    result = dict(config)

    for field in ("backgroundOverlayImage", "overlayImage"):
        if field in result and isinstance(result[field], str):
            result[field] = _normalize_asset_path(result[field])

    if "introProps" in result and isinstance(result["introProps"], dict):
        intro = dict(result["introProps"])
        for key in ("image1", "image2", "heroImage"):
            if key in intro and isinstance(intro[key], str):
                intro[key] = _normalize_asset_path(intro[key])
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
    config = _normalize_config_paths(config)
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
    cutoff = time.time() - RETENTION_SECONDS
    with _quick_state_lock:
        expired = [
            tid for tid, p in _quick_generate_results.items()
            if isinstance(p.get("created_at"), (int, float)) and float(p["created_at"]) < cutoff
        ]
        for tid in expired:
            _quick_generate_results.pop(tid, None)


# ── User-asset upload ─────────────────────────────────────────────────────────

def upload_user_asset(upload: UploadedFileData) -> str:
    """Save an uploaded image to TEMP_DIR/user-assets/ and return its HTTP URL."""
    _validate_image(upload, "file")
    suffix = _resolve_image_suffix(upload.filename)
    stem = Path(upload.filename).stem
    filename = f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"
    USER_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    (USER_ASSETS_DIR / filename).write_bytes(upload.data)
    return f"{USER_ASSETS_BASE_URL}/{filename}"


# ── Preview staging ───────────────────────────────────────────────────────────

def stage_preview_from_paths(
    template_key: str,
    audio_path: str,
    transcript_path: str,
    slider_image_paths: str,
    hero_image_path: str | None,
    overrides: dict | None = None,
) -> dict[str, object]:
    """Stage a preview from server-side file paths (JSON config mode)."""
    audio = load_file_from_path(audio_path, "audio_path")
    transcript = load_file_from_path(transcript_path, "transcript_path")
    image_list = load_images_from_folder(slider_image_paths)
    hero = load_file_from_path(hero_image_path, "hero_image_path") if hero_image_path else None
    return stage_preview(template_key, audio, transcript, image_list, hero, overrides)


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
    render_profile: str = "tiktok",
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

    profile_flags = RENDER_PROFILES.get(render_profile, RENDER_PROFILES["tiktok"])

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
                "--crf", str(profile_flags["crf"]),
                "--pixel-format", str(profile_flags["pixel_format"]),
                "--audio-codec", str(profile_flags["audio_codec"]),
                "--audio-bitrate", str(profile_flags["audio_bitrate"]),
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


# ── Quick Generate ─────────────────────────────────────────────────────────────

def _set_quick_generate_result(task_id: str, payload: dict[str, object]) -> None:
    with _quick_state_lock:
        _quick_generate_results[task_id] = payload


def get_quick_generate_result(task_id: str) -> dict[str, object] | None:
    with _quick_state_lock:
        return _quick_generate_results.get(task_id)


def start_quick_generate(
    url: str,
    template_id: str,
    voice_id: str,
    render_profile: str = "tiktok",
) -> str:
    """Orchestrate scrape → normalize → TTS → transcribe → image search/download → config.

    Returns a task_id immediately; the work runs in a background thread.
    Progress events are emitted on ``quick_generate_progress_store``.
    The final config (and file paths) is stored via ``get_quick_generate_result``.
    """
    if template_id not in QUICK_TEMPLATES:
        raise RuntimeError(f"Unknown template_id '{template_id}'")

    task_id = _new_id("n2v_quick")
    quick_generate_progress_store.set_progress(task_id, "starting", 0, "Initializing...")

    work_dir = TEMP_DIR / "quick_generate" / task_id
    BASE = "http://127.0.0.1:6901"

    def runner() -> None:
        try:
            work_dir.mkdir(parents=True, exist_ok=True)

            # ── Step 1: Scrape ───────────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "scraping", 5, "Scraping news article...")
            resp = httpx.post(f"{BASE}/api/v1/news-scraper/scrape", json={"url": url}, timeout=30.0)
            resp.raise_for_status()
            article = resp.json()
            meta = article.get("meta") or {}
            title = meta.get("title") or ""
            tags = " ".join(meta.get("tags") or [])
            image1 = meta.get("image") or ""
            paragraphs = (article.get("body") or {}).get("paragraphs") or []
            if not paragraphs:
                raise RuntimeError("Article body is empty")
            raw_text = "\n".join(paragraphs)
            quick_generate_progress_store.set_progress(task_id, "scraping", 10, f"Scraped: {title[:60]}")

            # ── Step 2: Generate thumbnail ───────────────────────────────────
            tmpl = QUICK_TEMPLATES[template_id]
            thumbnail_template_name = tmpl.get("thumbnail_template")
            image2 = ""
            if thumbnail_template_name:
                quick_generate_progress_store.set_progress(
                    task_id, "generating_thumbnail", 11, "Generating thumbnail image..."
                )
                try:
                    client_templates_dir = REPO_ROOT / "client" / "public" / "templates"
                    template_dir = client_templates_dir / str(thumbnail_template_name)
                    template_data: dict = json.loads(
                        (template_dir / "template.json").read_text(encoding="utf-8")
                    )
                    for el in template_data.get("elements", []):
                        if el.get("type") != "placeholder" and el.get("file"):
                            el["src"] = str((template_dir / el["file"]).resolve())
                            del el["file"]

                    thumb_resp = httpx.post(
                        f"{BASE}/api/v1/thumbnail/batch",
                        json={"template": template_data, "rows": [{"title": title}], "label_column": "title"},
                        timeout=30.0,
                    )
                    thumb_resp.raise_for_status()
                    thumb_job_id = thumb_resp.json().get("job_id")

                    if thumb_job_id:
                        THUMB_TIMEOUT = 120
                        thumb_elapsed = 0
                        THUMB_POLL = 2
                        while thumb_elapsed < THUMB_TIMEOUT:
                            time.sleep(THUMB_POLL)
                            thumb_elapsed += THUMB_POLL
                            thumb_status = httpx.get(
                                f"{BASE}/api/v1/thumbnail/batch/status/{thumb_job_id}",
                                timeout=15.0,
                            ).json()
                            if thumb_status.get("status") == "complete":
                                dl_url = (thumb_status.get("result") or {}).get("sample", {}).get("download_url", "")
                                if dl_url:
                                    image2 = f"{BASE}{dl_url}"
                                break
                            if thumb_status.get("status") == "error":
                                break
                    quick_generate_progress_store.set_progress(
                        task_id, "generating_thumbnail", 18, "Thumbnail generated."
                    )
                except Exception as thumb_exc:
                    log(f"Thumbnail generation skipped: {thumb_exc}", "warn", log_name="app-service.log")

            # ── Step 3: Normalize ────────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "normalizing", 20, "Normalizing text...")
            resp = httpx.post(
                f"{BASE}/api/v1/text/normalize",
                json={"text": raw_text, "language": "vi"},
                timeout=60.0,
            )
            resp.raise_for_status()
            normalized_text = resp.json().get("normalized_text") or ""
            if not normalized_text.strip():
                raise RuntimeError("Text normalization produced empty result")
            quick_generate_progress_store.set_progress(task_id, "normalizing", 20, "Text normalized.")

            # ── Step 3: TTS ──────────────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "tts", 25, "Generating TTS audio...")
            resp = httpx.post(
                f"{BASE}/api/v1/piper-tts/generate",
                json={"text": normalized_text, "voice_id": voice_id, "language": "vi", "normalize": False},
                timeout=300.0,
            )
            resp.raise_for_status()
            tts_data = resp.json()
            file_id = tts_data.get("file_id")
            if not file_id:
                raise RuntimeError("TTS did not return a file_id")

            quick_generate_progress_store.set_progress(task_id, "tts", 35, "Downloading TTS audio...")
            wav_resp = httpx.get(f"{BASE}/api/v1/files/{file_id}", timeout=120.0)
            wav_resp.raise_for_status()
            audio_path = work_dir / "tts.wav"
            audio_path.write_bytes(wav_resp.content)
            quick_generate_progress_store.set_progress(task_id, "tts", 40, "TTS audio saved.")

            # ── Step 4: Transcribe ───────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "transcribing", 42, "Submitting transcription job...")
            with open(audio_path, "rb") as f:
                transcribe_resp = httpx.post(
                    f"{BASE}/api/v1/whisper/transcribe",
                    files={"file": ("tts.wav", f, "audio/wav")},
                    data={"language": "vi", "add_punctuation": "true", "word_timestamps": "true", "script_text": normalized_text},
                    timeout=60.0,
                )
            transcribe_resp.raise_for_status()
            whisper_task_id = transcribe_resp.json().get("task_id")
            if not whisper_task_id:
                raise RuntimeError("Whisper did not return a task_id")

            WHISPER_TIMEOUT = 300
            POLL_INTERVAL = 2
            elapsed = 0
            result_data: dict = {}
            while elapsed < WHISPER_TIMEOUT:
                time.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                result_resp = httpx.get(
                    f"{BASE}/api/v1/whisper/transcribe/result/{whisper_task_id}",
                    timeout=15.0,
                )
                if result_resp.status_code == 404:
                    # Result not stored yet — still transcribing, keep polling
                    fraction = min(elapsed / WHISPER_TIMEOUT, 1.0)
                    mapped_pct = 42 + int(fraction * 21)
                    quick_generate_progress_store.set_progress(
                        task_id, "transcribing", mapped_pct, "Transcribing audio..."
                    )
                    continue
                result_resp.raise_for_status()
                result_data = result_resp.json()
                if result_data.get("status") == "complete":
                    break
            else:
                raise RuntimeError("Whisper transcription timed out after 5 minutes")

            segments = result_data.get("segments") or []
            transcript_path = work_dir / "transcript.json"
            transcript_path.write_text(
                json.dumps({"segments": segments}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            quick_generate_progress_store.set_progress(task_id, "transcribing", 65, "Transcript saved.")

            # ── Step 5: Image search ─────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "searching_images", 68, "Searching for images...")
            search_query = f"{title} {tags}".strip() or title
            search_resp = httpx.post(
                f"{BASE}/api/v1/image-search/image-finder/search",
                json={"text": search_query, "number_of_images": 10, "sources": ["bing"], "use_llm": False},
                timeout=120.0,
            )
            search_resp.raise_for_status()
            image_urls = [
                item["url"] for item in (search_resp.json().get("images") or [])
                if isinstance(item, dict) and item.get("url")
            ]
            if not image_urls:
                raise RuntimeError("No images found. Check Google search availability.")
            quick_generate_progress_store.set_progress(
                task_id, "searching_images", 75, f"Found {len(image_urls)} images."
            )

            # ── Step 6: Download images ──────────────────────────────────────
            images_dir = work_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)

            quick_generate_progress_store.set_progress(task_id, "downloading_images", 76, "Downloading images...")
            dl_resp = httpx.post(
                f"{BASE}/api/v1/image-search/image-finder/download-all",
                json={"urls": image_urls, "save_dir": str(images_dir)},
                timeout=30.0,
            )
            dl_resp.raise_for_status()
            dl_task_id = dl_resp.json().get("task_id")
            if not dl_task_id:
                raise RuntimeError("Image download did not return a task_id")

            with httpx.stream(
                "GET",
                f"{BASE}/api/v1/image-search/image-finder/download-all/stream/{dl_task_id}",
                timeout=300.0,
            ) as stream_resp:
                for line in stream_resp.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    try:
                        evt = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    evt_status = evt.get("status", "")
                    if evt_status == "complete":
                        break
                    if evt_status == "error":
                        raise RuntimeError(f"Image download failed: {evt.get('message', '')}")
                    pct_inner = int(evt.get("percent") or 0)
                    mapped = 76 + int(pct_inner * 0.11)
                    quick_generate_progress_store.set_progress(
                        task_id, "downloading_images", mapped, f"Downloading images... {pct_inner}%"
                    )

            saved_images = sorted(
                f for f in images_dir.iterdir()
                if f.is_file() and f.suffix.lower() in ALLOWED_IMAGE_SUFFIXES
            )
            if not saved_images:
                raise RuntimeError("Image download completed but no images were saved.")
            quick_generate_progress_store.set_progress(
                task_id, "downloading_images", 88, f"Downloaded {len(saved_images)} images."
            )

            # ── Step 8: Build config ─────────────────────────────────────────
            quick_generate_progress_store.set_progress(task_id, "building_config", 93, "Building video config...")
            intro_props: dict[str, str] = {
                "image1": image1,
                "heroImage": tmpl["hero"],
            }
            if image2:
                intro_props["image2"] = image2
            config: dict[str, object] = {
                "template": "NewsVerticalBackground",
                "audio_path": str(audio_path),
                "transcript_path": str(transcript_path),
                "slider_image_paths": str(images_dir),
                "introDurationInFrames": 150,
                "imageDurationInFrames": 170,
                "introProps": intro_props,
                "backgroundOverlayImage": tmpl["bg"],
                "backgroundMusicVolume": 0.36,
                "backgroundMusic": tmpl["music"],
            }
            quick_generate_progress_store.set_progress(task_id, "building_config", 97, "Config assembled.")

            # ── Step 8: Store result ─────────────────────────────────────────
            _set_quick_generate_result(task_id, {
                "status": "complete",
                "created_at": time.time(),
                "config": config,
                "audio_path": str(audio_path),
                "transcript_path": str(transcript_path),
                "slider_image_paths": str(images_dir),
                "hero_image_path": None,
            })
            quick_generate_progress_store.set_progress(task_id, "complete", 100, "Quick generate complete!")

        except Exception as exc:
            quick_generate_progress_store.add_log(task_id, f"[ERROR] {exc}")
            quick_generate_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Quick generate failed: {exc}", "error", log_name="app-service.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id
