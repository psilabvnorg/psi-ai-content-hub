from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path
from typing import Dict, Optional
from urllib.request import urlopen

from python_api.common.logging import log
from python_api.common.paths import MODEL_ROOT, TEMP_DIR
from python_api.common.progress import ProgressStore


TOOLS_ROOT = MODEL_ROOT.parent / "tools"

FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
progress_store = ProgressStore()


def _ensure_dirs() -> None:
    TOOLS_ROOT.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _which(name: str) -> Optional[str]:
    return shutil.which(name)


def _ffmpeg_bin_path() -> Optional[Path]:
    direct = _which("ffmpeg")
    if direct:
        return Path(direct)
    candidate_root = TOOLS_ROOT / "ffmpeg"
    if not candidate_root.exists():
        return None
    for item in candidate_root.rglob("ffmpeg.exe"):
        return item
    return None


def _yt_dlp_path() -> Optional[Path]:
    direct = _which("yt-dlp")
    if direct:
        return Path(direct)
    # Fallback: check venv Scripts dir (venv not activated when launched from Electron)
    venv_scripts = Path(sys.executable).parent
    candidate = venv_scripts / ("yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
    if candidate.exists():
        return candidate
    return None


def aget_ffmpeg_bin_path_data() -> Optional[Path]:
    """Return resolved FFmpeg binary path if available."""
    return _ffmpeg_bin_path()


def aget_yt_dlp_bin_path_data() -> Optional[Path]:
    """Return resolved yt-dlp binary path if available."""
    return _yt_dlp_path()


def _torch_status() -> Dict[str, Optional[str] | bool]:
    try:
        import torch

        return {
            "installed": True,
            "version": torch.__version__,
            "cuda": torch.version.cuda,
            "path": getattr(torch, "__file__", None),
        }
    except Exception:
        return {"installed": False, "version": None, "cuda": None, "path": None}


def get_system_tools_status() -> Dict[str, Dict]:
    return {
        "ffmpeg": {"installed": _ffmpeg_bin_path() is not None, "path": str(_ffmpeg_bin_path()) if _ffmpeg_bin_path() else None},
        "yt_dlp": {"installed": _yt_dlp_path() is not None, "path": str(_yt_dlp_path()) if _yt_dlp_path() else None},
        "torch": _torch_status(),
    }


def install_tool(tool_id: str) -> str:
    task_id = f"tool_{tool_id}_{int(time.time())}"
    progress_store.set_progress(task_id, "starting", 0, f"Starting {tool_id} setup...")

    def runner() -> None:
        try:
            _ensure_dirs()
            if tool_id == "ffmpeg":
                _install_ffmpeg(task_id)
            elif tool_id == "yt-dlp":
                _install_ytdlp(task_id)
            elif tool_id == "torch":
                _install_torch(task_id)
            else:
                raise RuntimeError("Unsupported tool id")
            progress_store.set_progress(task_id, "complete", 100, "Complete")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Tool install failed for {tool_id}: {exc}", "error", log_name="app-service.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id


def _download_with_progress(url: str, target: Path, task_id: str, start: int, end: int) -> None:
    progress_store.add_log(task_id, f"Downloading {url}")
    with urlopen(url) as response:
        total = int(response.headers.get("Content-Length") or 0)
        downloaded = 0
        chunk_size = 1024 * 1024
        with target.open("wb") as handle:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    percent = start + int((downloaded / total) * (end - start))
                else:
                    percent = start
                progress_store.set_progress(task_id, "downloading", min(end, percent), "Downloading...")


def _install_ffmpeg(task_id: str) -> None:
    progress_store.set_progress(task_id, "downloading", 5, "Downloading FFmpeg...")
    zip_path = TEMP_DIR / "ffmpeg.zip"
    if zip_path.exists():
        zip_path.unlink(missing_ok=True)
    _download_with_progress(FFMPEG_URL, zip_path, task_id, 5, 70)
    progress_store.set_progress(task_id, "extracting", 75, "Extracting FFmpeg...")
    target_dir = TOOLS_ROOT / "ffmpeg"
    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)
    target_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(target_dir)
    zip_path.unlink(missing_ok=True)
    ffmpeg_path = _ffmpeg_bin_path()
    if not ffmpeg_path:
        raise RuntimeError("FFmpeg binary not found after extraction")
    os.environ["PATH"] = f"{ffmpeg_path.parent};{os.environ.get('PATH', '')}"
    progress_store.set_progress(task_id, "complete", 100, "FFmpeg ready")


def _install_ytdlp(task_id: str) -> None:
    progress_store.set_progress(task_id, "installing", 20, "Installing yt-dlp...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"])
    progress_store.set_progress(task_id, "complete", 100, "yt-dlp installed")


def _install_torch(task_id: str) -> None:
    progress_store.set_progress(task_id, "installing", 20, "Installing PyTorch...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "torchvision", "torchaudio"])
    progress_store.set_progress(task_id, "complete", 100, "PyTorch installed")
