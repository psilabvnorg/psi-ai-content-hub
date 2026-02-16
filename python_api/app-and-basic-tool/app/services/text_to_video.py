from __future__ import annotations

import json
import os
import re
import signal
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR
from python_api.common.progress import ProgressStore


F5_API_URL = "http://127.0.0.1:6902"
WHISPER_API_URL = "http://127.0.0.1:6904"
RETENTION_SECONDS = 60 * 60
REQUEST_TIMEOUT = 60
SSE_TIMEOUT = 60 * 60
RENDER_CONCURRENCY = 4

REPO_ROOT = Path(__file__).resolve().parents[4]
REMOTION_ROOT = REPO_ROOT / "remotion" / "news"
REMOTION_PUBLIC_MAIN = REMOTION_ROOT / "public" / "main"
DEFAULT_INTRO_CONFIG_PATH = REMOTION_PUBLIC_MAIN / "video_4" / "config" / "intro-config.json"

PREVIEW_DIR_NAME = "preview"
PREVIEW_STAGING_ROOT = REMOTION_PUBLIC_MAIN / PREVIEW_DIR_NAME
STUDIO_PORT = 3100

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
INTRO_ALLOWED_KEYS = {
    "templateId",
    "title",
    "brandName",
    "tagline",
    "url",
    "gradientTopColor",
    "gradientBottomColor",
    "brandNameColor",
    "accentColor",
    "taglineColor",
    "titleColor",
    "urlColor",
    "showBackgroundPattern",
    "showTopLogo",
    "showBrandLogo",
    "showSocialIcons",
    "showFacebook",
    "showTikTok",
    "showYouTube",
    "showInstagram",
    "showMoneyElement",
    "showProfitElement",
    "enableAudio",
}

_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)%")

audio_progress_store = ProgressStore()
render_progress_store = ProgressStore()

_audio_results: dict[str, dict[str, object]] = {}
_render_results: dict[str, dict[str, object]] = {}
_sessions: dict[str, "TextToVideoSession"] = {}
_state_lock = threading.Lock()

_studio_process: subprocess.Popen | None = None
_studio_lock = threading.Lock()


@dataclass(frozen=True)
class UploadedImageData:
    filename: str
    content_type: str | None
    data: bytes


@dataclass(frozen=True)
class UploadedArtifactData:
    filename: str
    content_type: str | None
    data: bytes


@dataclass
class TextToVideoSession:
    session_id: str
    created_at: float
    root_dir: Path
    audio_path: Path
    transcript_path: Path
    transcript_payload: dict[str, object]
    audio_file_id: str
    transcript_file_id: str


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _to_service_url(base_url: str, path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    if path_or_url.startswith("/"):
        return f"{base_url}{path_or_url}"
    return f"{base_url}/{path_or_url}"


def _safe_json_load(raw: bytes) -> dict[str, object]:
    decoded = raw.decode("utf-8", errors="replace")
    value = json.loads(decoded)
    if not isinstance(value, dict):
        raise RuntimeError("Expected JSON object response")
    return value


def _http_get_json(url: str, timeout: int = REQUEST_TIMEOUT) -> dict[str, object]:
    request = Request(url, method="GET")
    with urlopen(request, timeout=timeout) as response:
        return _safe_json_load(response.read())


def _http_get_bytes(url: str, timeout: int = REQUEST_TIMEOUT) -> bytes:
    request = Request(url, method="GET")
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _http_post_json(url: str, payload: dict[str, object], timeout: int = REQUEST_TIMEOUT) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return _safe_json_load(response.read())


def _encode_multipart_body(
    fields: dict[str, str],
    files: list[tuple[str, str, bytes, str]],
) -> tuple[bytes, str]:
    boundary = f"----psi-t2v-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")

    for field_name, filename, content, content_type in files:
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        chunks.append(content)
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _http_post_multipart(
    url: str,
    fields: dict[str, str],
    files: list[tuple[str, str, bytes, str]],
    timeout: int = REQUEST_TIMEOUT,
) -> dict[str, object]:
    body, content_type = _encode_multipart_body(fields, files)
    request = Request(url, data=body, headers={"Content-Type": content_type}, method="POST")
    with urlopen(request, timeout=timeout) as response:
        return _safe_json_load(response.read())


def _copy_latest_logs(task_id: str, target_store: ProgressStore, source_logs: object, prefix: str) -> None:
    if not isinstance(source_logs, list):
        return
    for raw_line in source_logs[-5:]:
        if isinstance(raw_line, str) and raw_line.strip():
            target_store.add_log(task_id, f"{prefix} {raw_line.strip()}")


def _set_progress_from_payload(
    task_id: str,
    payload: dict[str, object],
    store: ProgressStore,
    start_percent: int,
    end_percent: int,
    default_message: str,
) -> None:
    raw_percent = payload.get("percent")
    percent_value = 0
    if isinstance(raw_percent, (int, float)):
        percent_value = max(0, min(100, int(raw_percent)))
    mapped = start_percent + int((percent_value / 100) * max(0, end_percent - start_percent))
    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        message = default_message
    store.set_progress(task_id, "processing", mapped, message)


def _consume_sse(
    stream_url: str,
    on_payload: Callable[[dict[str, object]], None],
) -> dict[str, object]:
    request = Request(stream_url, method="GET")
    try:
        with urlopen(request, timeout=SSE_TIMEOUT) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                payload_text = line[len("data:") :].strip()
                if not payload_text:
                    continue
                try:
                    decoded = json.loads(payload_text)
                except json.JSONDecodeError:
                    continue
                if not isinstance(decoded, dict):
                    continue
                on_payload(decoded)
                status = decoded.get("status")
                if isinstance(status, str) and status in {"complete", "error", "failed", "completed"}:
                    return decoded
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"SSE stream failed: {exc}") from exc

    raise RuntimeError("SSE stream ended unexpectedly")


def _save_intro_config(
    staging_config_dir: Path,
    content_dir_name: str,
    intro_filename: str,
    intro_config: dict[str, object],
) -> None:
    if not DEFAULT_INTRO_CONFIG_PATH.exists():
        raise RuntimeError(f"Default intro config not found: {DEFAULT_INTRO_CONFIG_PATH}")

    base_intro = json.loads(DEFAULT_INTRO_CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(base_intro, dict):
        raise RuntimeError("Invalid default intro config format")

    merged_intro = dict(base_intro)
    for key in INTRO_ALLOWED_KEYS:
        if key in intro_config:
            merged_intro[key] = intro_config[key]

    merged_intro["backgroundImage"] = f"main/{content_dir_name}/image/{intro_filename}"

    target_path = staging_config_dir / "intro-config.json"
    target_path.write_text(json.dumps(merged_intro, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_video_config(staging_config_dir: Path, orientation: str) -> None:
    config = {
        "orientation": orientation,
        "backgroundMode": False,
        "introDurationInFrames": 150,
        "imageDurationInFrames": 170,
    }
    target_path = staging_config_dir / "video-config.json"
    target_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _validate_image_upload(upload: UploadedImageData, field_name: str) -> None:
    suffix = Path(upload.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise RuntimeError(f"{field_name} has unsupported file extension: {suffix or '<none>'}")
    if upload.content_type and not upload.content_type.startswith("image/"):
        raise RuntimeError(f"{field_name} must be an image file")
    if not upload.data:
        raise RuntimeError(f"{field_name} is empty")


def _resolve_image_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in ALLOWED_IMAGE_SUFFIXES:
        return suffix
    return ".jpg"


def _set_audio_result(task_id: str, payload: dict[str, object]) -> None:
    with _state_lock:
        _audio_results[task_id] = payload


def _set_render_result(task_id: str, payload: dict[str, object]) -> None:
    with _state_lock:
        _render_results[task_id] = payload


def _set_session(session: TextToVideoSession) -> None:
    with _state_lock:
        _sessions[session.session_id] = session


def _get_session(session_id: str) -> TextToVideoSession | None:
    with _state_lock:
        return _sessions.get(session_id)


def get_audio_result(task_id: str) -> dict[str, object] | None:
    with _state_lock:
        return _audio_results.get(task_id)


def get_render_result(task_id: str) -> dict[str, object] | None:
    with _state_lock:
        return _render_results.get(task_id)


def _cleanup_expired_state() -> None:
    cutoff = time.time() - RETENTION_SECONDS
    with _state_lock:
        expired_session_ids = [sid for sid, session in _sessions.items() if session.created_at < cutoff]
        expired_audio_ids = [
            task_id
            for task_id, payload in _audio_results.items()
            if isinstance(payload.get("created_at"), (int, float)) and float(payload["created_at"]) < cutoff
        ]
        expired_render_ids = [
            task_id
            for task_id, payload in _render_results.items()
            if isinstance(payload.get("created_at"), (int, float)) and float(payload["created_at"]) < cutoff
        ]

        for session_id in expired_session_ids:
            session = _sessions.pop(session_id, None)
            if session and session.root_dir.exists():
                shutil.rmtree(session.root_dir, ignore_errors=True)

        for task_id in expired_audio_ids:
            _audio_results.pop(task_id, None)

        for task_id in expired_render_ids:
            _render_results.pop(task_id, None)


def cleanup_text_to_video_state() -> None:
    _cleanup_expired_state()


def start_audio_pipeline(job_store: JobStore, text: str, voice_id: str) -> str:
    task_id = _new_id("t2v_audio")
    audio_progress_store.set_progress(task_id, "starting", 0, "Starting text-to-audio pipeline...")

    def runner() -> None:
        session_root = TEMP_DIR / "t2v_sessions" / _new_id("session")
        try:
            _cleanup_expired_state()
            session_root.mkdir(parents=True, exist_ok=True)
            session_audio_dir = session_root / "audio"
            session_audio_dir.mkdir(parents=True, exist_ok=True)

            audio_progress_store.add_log(task_id, "Submitting voice generation request to F5 service...")
            f5_create = _http_post_json(
                _to_service_url(F5_API_URL, "/api/v1/generate"),
                {
                    "voice_id": voice_id,
                    "text": text,
                    "speed": 1.0,
                    "cfg_strength": 2.0,
                    "nfe_step": 32,
                    "remove_silence": False,
                },
            )
            f5_task_id = f5_create.get("task_id")
            if not isinstance(f5_task_id, str) or not f5_task_id:
                raise RuntimeError("Invalid F5 response: missing task_id")

            def on_f5_payload(payload: dict[str, object]) -> None:
                _set_progress_from_payload(
                    task_id,
                    payload,
                    audio_progress_store,
                    start_percent=5,
                    end_percent=55,
                    default_message="Generating voice audio...",
                )
                _copy_latest_logs(task_id, audio_progress_store, payload.get("logs"), "[F5]")

            f5_final = _consume_sse(_to_service_url(F5_API_URL, f"/api/v1/generate/stream/{f5_task_id}"), on_f5_payload)
            if f5_final.get("status") == "error":
                message = f5_final.get("message")
                raise RuntimeError(str(message) if message else "F5 generation failed")

            audio_progress_store.add_log(task_id, "Fetching generated WAV from F5 service...")
            f5_download = _http_get_json(_to_service_url(F5_API_URL, f"/api/v1/generate/download/{f5_task_id}"))
            f5_download_url = f5_download.get("download_url")
            if not isinstance(f5_download_url, str):
                raise RuntimeError("Invalid F5 download response")

            wav_bytes = _http_get_bytes(_to_service_url(F5_API_URL, f5_download_url))
            wav_path = session_audio_dir / "narration.wav"
            wav_path.write_bytes(wav_bytes)

            audio_progress_store.set_progress(task_id, "processing", 60, "Submitting audio to Whisper STT...")
            whisper_create = _http_post_multipart(
                _to_service_url(WHISPER_API_URL, "/api/v1/transcribe"),
                {
                    "model": "base",
                    "language": "vi",
                    "add_punctuation": "true",
                    "word_timestamps": "true",
                },
                [("file", "narration.wav", wav_bytes, "audio/wav")],
            )
            whisper_task_id = whisper_create.get("task_id")
            if not isinstance(whisper_task_id, str) or not whisper_task_id:
                raise RuntimeError("Invalid Whisper response: missing task_id")

            def on_whisper_payload(payload: dict[str, object]) -> None:
                _set_progress_from_payload(
                    task_id,
                    payload,
                    audio_progress_store,
                    start_percent=60,
                    end_percent=95,
                    default_message="Generating transcript with timestamps...",
                )
                _copy_latest_logs(task_id, audio_progress_store, payload.get("logs"), "[Whisper]")

            whisper_final = _consume_sse(
                _to_service_url(WHISPER_API_URL, f"/api/v1/transcribe/stream/{whisper_task_id}"),
                on_whisper_payload,
            )
            if whisper_final.get("status") == "error":
                message = whisper_final.get("message")
                raise RuntimeError(str(message) if message else "Whisper transcription failed")

            whisper_result = _http_get_json(_to_service_url(WHISPER_API_URL, f"/api/v1/transcribe/result/{whisper_task_id}"))
            transcript_path = session_audio_dir / "narration.json"
            transcript_path.write_text(json.dumps(whisper_result, ensure_ascii=False, indent=2), encoding="utf-8")

            audio_file = job_store.add_file(wav_path, wav_path.name)
            transcript_file = job_store.add_file(transcript_path, transcript_path.name)

            session_id = _new_id("t2v_session")
            transcript_payload: dict[str, object] = whisper_result
            session = TextToVideoSession(
                session_id=session_id,
                created_at=time.time(),
                root_dir=session_root,
                audio_path=wav_path,
                transcript_path=transcript_path,
                transcript_payload=transcript_payload,
                audio_file_id=audio_file.file_id,
                transcript_file_id=transcript_file.file_id,
            )
            _set_session(session)

            _set_audio_result(
                task_id,
                {
                    "created_at": time.time(),
                    "session_id": session_id,
                    "audio": {
                        "filename": audio_file.filename,
                        "download_url": f"/api/v1/files/{audio_file.file_id}",
                    },
                    "transcript": transcript_payload,
                    "transcript_file": {
                        "filename": transcript_file.filename,
                        "download_url": f"/api/v1/files/{transcript_file.file_id}",
                    },
                },
            )
            audio_progress_store.set_progress(task_id, "complete", 100, "Audio and transcript generated successfully.")
        except Exception as exc:
            audio_progress_store.add_log(task_id, f"[ERROR] {exc}")
            audio_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Text-to-video audio pipeline failed: {exc}", "error", log_name="app-service.log")
            if session_root.exists():
                shutil.rmtree(session_root, ignore_errors=True)

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def create_audio_session_from_upload(
    job_store: JobStore,
    audio_upload: UploadedArtifactData,
    transcript_upload: UploadedArtifactData,
) -> dict[str, object]:
    _cleanup_expired_state()

    audio_filename = audio_upload.filename.strip()
    if not audio_filename:
        raise RuntimeError("audio_file is required")
    if not audio_upload.data:
        raise RuntimeError("audio_file is empty")
    if Path(audio_filename).suffix.lower() != ".wav":
        raise RuntimeError("audio_file must be a .wav file")

    transcript_filename = transcript_upload.filename.strip()
    if not transcript_filename:
        raise RuntimeError("transcript_file is required")
    if not transcript_upload.data:
        raise RuntimeError("transcript_file is empty")

    try:
        transcript_payload_raw = json.loads(transcript_upload.data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("transcript_file is invalid JSON") from exc
    if not isinstance(transcript_payload_raw, dict):
        raise RuntimeError("transcript_file must be a JSON object")

    session_root = TEMP_DIR / "t2v_sessions" / _new_id("session")
    try:
        session_root.mkdir(parents=True, exist_ok=True)
        session_audio_dir = session_root / "audio"
        session_audio_dir.mkdir(parents=True, exist_ok=True)

        wav_path = session_audio_dir / "narration.wav"
        wav_path.write_bytes(audio_upload.data)

        transcript_path = session_audio_dir / "narration.json"
        transcript_path.write_text(
            json.dumps(transcript_payload_raw, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        audio_file = job_store.add_file(wav_path, wav_path.name)
        transcript_file = job_store.add_file(transcript_path, transcript_path.name)

        session_id = _new_id("t2v_session")
        transcript_payload: dict[str, object] = transcript_payload_raw
        session = TextToVideoSession(
            session_id=session_id,
            created_at=time.time(),
            root_dir=session_root,
            audio_path=wav_path,
            transcript_path=transcript_path,
            transcript_payload=transcript_payload,
            audio_file_id=audio_file.file_id,
            transcript_file_id=transcript_file.file_id,
        )
        _set_session(session)

        return {
            "created_at": time.time(),
            "session_id": session_id,
            "audio": {
                "filename": audio_file.filename,
                "download_url": f"/api/v1/files/{audio_file.file_id}",
            },
            "transcript": transcript_payload,
            "transcript_file": {
                "filename": transcript_file.filename,
                "download_url": f"/api/v1/files/{transcript_file.file_id}",
            },
        }
    except Exception:
        if session_root.exists():
            shutil.rmtree(session_root, ignore_errors=True)
        raise


def _stage_assets(
    staging_root: Path,
    content_dir_name: str,
    session: TextToVideoSession,
    orientation: str,
    intro_image: UploadedImageData,
    images: list[UploadedImageData],
    intro_config: dict[str, object],
) -> None:
    """Stage audio, images, and config files into a Remotion public directory."""
    staging_audio_dir = staging_root / "audio"
    staging_image_dir = staging_root / "image"
    staging_config_dir = staging_root / "config"
    staging_audio_dir.mkdir(parents=True, exist_ok=True)
    staging_image_dir.mkdir(parents=True, exist_ok=True)
    staging_config_dir.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(session.audio_path, staging_audio_dir / "narration.wav")
    shutil.copyfile(session.transcript_path, staging_audio_dir / "narration.json")

    intro_suffix = _resolve_image_suffix(intro_image.filename)
    intro_filename = f"Intro{intro_suffix}"
    (staging_image_dir / intro_filename).write_bytes(intro_image.data)

    for index, image in enumerate(images, start=1):
        suffix = _resolve_image_suffix(image.filename)
        ordered_name = f"{index:02d}{suffix}"
        (staging_image_dir / ordered_name).write_bytes(image.data)

    _write_video_config(staging_config_dir, orientation)
    _save_intro_config(staging_config_dir, content_dir_name, intro_filename, intro_config)


def start_studio() -> dict[str, object]:
    """Start Remotion Studio subprocess if not already running."""
    global _studio_process
    with _studio_lock:
        if _studio_process is not None and _studio_process.poll() is None:
            return {"status": "already_running", "port": STUDIO_PORT}

        cmd = [
            "npx",
            "remotion",
            "studio",
            "--port",
            str(STUDIO_PORT),
            "--log",
            "error",
        ]
        _studio_process = subprocess.Popen(
            cmd,
            cwd=str(REMOTION_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=(os.name == "nt"),
            # On Unix, start in own process group so we can kill the whole tree
            preexec_fn=os.setsid if os.name != "nt" else None,
        )
        return {"status": "started", "port": STUDIO_PORT}


def get_studio_status() -> dict[str, object]:
    """Check if Remotion Studio is running."""
    with _studio_lock:
        if _studio_process is not None and _studio_process.poll() is None:
            return {"running": True, "port": STUDIO_PORT}
        return {"running": False, "port": STUDIO_PORT}


def stop_studio() -> dict[str, object]:
    """Stop Remotion Studio subprocess (kills entire process tree on Windows)."""
    global _studio_process
    with _studio_lock:
        if _studio_process is not None and _studio_process.poll() is None:
            if os.name == "nt":
                # On Windows with shell=True, terminate() only kills cmd.exe,
                # not the child node process. Use taskkill /T to kill the tree.
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(_studio_process.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.killpg(os.getpgid(_studio_process.pid), signal.SIGTERM)
                try:
                    _studio_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(os.getpgid(_studio_process.pid), signal.SIGKILL)
            _studio_process = None
            return {"status": "stopped"}
        _studio_process = None
        return {"status": "not_running"}


def stage_preview(
    session_id: str,
    orientation: str,
    intro_image: UploadedImageData,
    images: list[UploadedImageData],
    intro_config: dict[str, object],
) -> dict[str, object]:
    """Stage files to the preview directory for Remotion Studio viewing."""
    session = _get_session(session_id)
    if not session:
        raise RuntimeError("Session not found or expired")
    if not session.audio_path.exists() or not session.transcript_path.exists():
        raise RuntimeError("Session artifacts are missing")

    _validate_image_upload(intro_image, "intro_image")
    if len(images) < 1 or len(images) > 10:
        raise RuntimeError("images must contain between 1 and 10 files")
    for index, image in enumerate(images):
        _validate_image_upload(image, f"images[{index}]")

    if PREVIEW_STAGING_ROOT.exists():
        shutil.rmtree(PREVIEW_STAGING_ROOT, ignore_errors=True)

    _stage_assets(
        staging_root=PREVIEW_STAGING_ROOT,
        content_dir_name=PREVIEW_DIR_NAME,
        session=session,
        orientation=orientation,
        intro_image=intro_image,
        images=images,
        intro_config=intro_config,
    )

    return {
        "content_directory": f"main/{PREVIEW_DIR_NAME}",
        "studio_url": f"http://localhost:{STUDIO_PORT}",
    }


def start_render_pipeline(
    job_store: JobStore,
    session_id: str,
    orientation: Literal["vertical", "horizontal"],
    intro_image: UploadedImageData,
    images: list[UploadedImageData],
    intro_config: dict[str, object],
) -> str:
    _cleanup_expired_state()

    session = _get_session(session_id)
    if not session:
        raise RuntimeError("Session not found or expired")
    if not session.audio_path.exists() or not session.transcript_path.exists():
        raise RuntimeError("Session artifacts are missing")

    if not REMOTION_ROOT.exists():
        raise RuntimeError(f"Remotion project not found: {REMOTION_ROOT}")
    if not (REMOTION_ROOT / "render.js").exists():
        raise RuntimeError(f"Remotion render script not found: {REMOTION_ROOT / 'render.js'}")

    _validate_image_upload(intro_image, "intro_image")
    if len(images) < 1 or len(images) > 10:
        raise RuntimeError("images must contain between 1 and 10 files")
    for index, image in enumerate(images):
        _validate_image_upload(image, f"images[{index}]")

    task_id = _new_id("t2v_render")
    render_progress_store.set_progress(task_id, "starting", 0, "Starting video render pipeline...")

    def runner() -> None:
        staging_root = REMOTION_PUBLIC_MAIN / f"t2v_{task_id}"
        try:
            render_progress_store.set_progress(task_id, "processing", 5, "Preparing Remotion staging assets...")
            content_dir_name = f"t2v_{task_id}"
            _stage_assets(
                staging_root=staging_root,
                content_dir_name=content_dir_name,
                session=session,
                orientation=orientation,
                intro_image=intro_image,
                images=images,
                intro_config=intro_config,
            )

            output_path = TEMP_DIR / f"t2v_video_{task_id}.mp4"
            if output_path.exists():
                output_path.unlink()

            cmd = [
                "node",
                "render.js",
                "--content",
                f"main/{content_dir_name}",
                "--output",
                str(output_path),
                "--concurrency",
                str(RENDER_CONCURRENCY),
            ]

            render_progress_store.set_progress(task_id, "processing", 20, "Starting Remotion render...")
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
                percent_match = _PERCENT_RE.search(line)
                if percent_match:
                    try:
                        percent_value = float(percent_match.group(1))
                        mapped = 20 + int(max(0.0, min(100.0, percent_value)) * 0.75)
                        render_progress_store.set_progress(task_id, "processing", min(mapped, 95), "Rendering video...")
                    except ValueError:
                        continue

            return_code = process.wait()
            if return_code != 0:
                raise RuntimeError(f"Remotion render failed with exit code {return_code}")
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
            log(f"Text-to-video render pipeline failed: {exc}", "error", log_name="app-service.log")
        finally:
            if staging_root.exists():
                shutil.rmtree(staging_root, ignore_errors=True)

    threading.Thread(target=runner, daemon=True).start()
    return task_id
