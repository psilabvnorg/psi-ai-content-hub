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
import importlib.util
try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore

from ..logging import log
from ..psi_server_utils import ProgressStore
from ..settings import TEMP_DIR


APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
MODEL_ROOT = Path(APPDATA) / "psi-ai-content-hub" / "models"
TOOLS_ROOT = Path(APPDATA) / "psi-ai-content-hub" / "tools"
VIENEU_REPO_ROOT = Path(__file__).resolve().parents[2] / "python_api" / "VieNeu-TTS"

FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
VIENEU_HF_REPO = "pnnbao-ump/VieNeu-TTS"
F5_HF_REPO = "hynt/F5-TTS-Vietnamese-ViVoice"
WHISPER_LARGE_V3 = "openai/whisper-large-v3"
progress_store = ProgressStore()


def _ensure_dirs() -> None:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    TOOLS_ROOT.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _which(name: str) -> Optional[str]:
    found = shutil.which(name)
    return found


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
    return None


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


def _vieneu_status() -> Dict[str, Optional[str] | bool]:
    model_dir = MODEL_ROOT / "vieneu-tts"
    exists = model_dir.exists() and any(model_dir.iterdir())
    return {"installed": bool(exists), "path": str(model_dir) if exists else None}


def _vieneu_deps_status() -> Dict[str, Optional[str] | bool | list[str]]:
    required_modules = [
        "vieneu",
        "neucodec",
        "phonemizer",
        "librosa",
        "onnxruntime",
        "soundfile",
    ]
    missing = []
    if VIENEU_REPO_ROOT.exists() and str(VIENEU_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(VIENEU_REPO_ROOT))
    for module in required_modules:
        if importlib.util.find_spec(module) is None:
            missing.append(module)
    return {"installed": len(missing) == 0, "missing": missing}


def _f5_status() -> Dict[str, Optional[str] | bool]:
    model_dir = MODEL_ROOT / "f5-tts"
    model_file = model_dir / "model_last.pt"
    return {"installed": model_file.exists(), "path": str(model_file) if model_file.exists() else None}


def _whisper_status() -> Dict[str, Optional[str] | bool]:
    model_dir = MODEL_ROOT / "whisper"
    model_file = model_dir / "large-v3.pt"
    return {"installed": model_file.exists(), "model": "large-v3", "path": str(model_file) if model_file.exists() else None}


def get_system_tools_status() -> Dict[str, Dict]:
    return {
        "ffmpeg": {"installed": _ffmpeg_bin_path() is not None, "path": str(_ffmpeg_bin_path()) if _ffmpeg_bin_path() else None},
        "yt_dlp": {"installed": _yt_dlp_path() is not None, "path": str(_yt_dlp_path()) if _yt_dlp_path() else None},
        "torch": _torch_status(),
        "vieneu_tts": _vieneu_status(),
        "vieneu_tts_deps": _vieneu_deps_status(),
        "f5_tts": _f5_status(),
        "whisper": _whisper_status(),
    }


def get_manager_status() -> list[dict]:
    status = get_system_tools_status()
    rows = [
        {
            "id": "yt-dlp",
            "name": "yt-dlp",
            "status": "ready" if status["yt_dlp"]["installed"] else "not_ready",
            "path": status["yt_dlp"]["path"],
            "can_install": True,
        },
        {
            "id": "ffmpeg",
            "name": "ffmpeg",
            "status": "ready" if status["ffmpeg"]["installed"] else "not_ready",
            "path": status["ffmpeg"]["path"],
            "can_install": True,
        },
        {
            "id": "torch-cu121",
            "name": "PyTorch CUDA cu121",
            "status": "ready" if status["torch"]["installed"] else "not_ready",
            "path": status["torch"]["path"],
            "can_install": True,
        },
        {
            "id": "vieneu-tts",
            "name": "VieNeu TTS",
            "status": "ready" if status["vieneu_tts"]["installed"] else "not_ready",
            "path": status["vieneu_tts"]["path"],
            "can_install": True,
        },
        {
            "id": "vieneu-tts-deps",
            "name": "VieNeu TTS Dependencies",
            "status": "ready" if status["vieneu_tts_deps"]["installed"] else "not_ready",
            "path": None,
            "can_install": True,
        },
        {
            "id": "f5-tts",
            "name": "F5-TTS",
            "status": "ready" if status["f5_tts"]["installed"] else "not_ready",
            "path": status["f5_tts"]["path"],
            "can_install": True,
        },
        {
            "id": "whisper-large-v3",
            "name": "Whisper large-v3",
            "status": "ready" if status["whisper"]["installed"] else "not_ready",
            "path": status["whisper"]["path"],
            "can_install": True,
        },
    ]
    return rows


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
            elif tool_id == "torch-cu121":
                _install_torch(task_id)
            elif tool_id == "vieneu-tts":
                _install_vieneu(task_id)
            elif tool_id == "vieneu-tts-deps":
                _install_vieneu_deps(task_id)
            elif tool_id == "f5-tts":
                _install_f5(task_id)
            elif tool_id == "whisper-large-v3":
                _install_whisper(task_id)
            else:
                raise RuntimeError("Unsupported tool id")
            progress_store.set_progress(task_id, "complete", 100, "Complete")
        except Exception as exc:
            progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Tool install failed for {tool_id}: {exc}", "error")

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
    progress_store.set_progress(task_id, "installing", 20, "Installing PyTorch (cu121)...")
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "torch",
            "torchvision",
            "torchaudio",
            "--index-url",
            "https://download.pytorch.org/whl/cu121",
        ]
    )
    progress_store.set_progress(task_id, "complete", 100, "PyTorch installed")


def _install_vieneu(task_id: str) -> None:
    if VIENEU_HF_REPO.startswith("TODO/"):
        raise RuntimeError("VieNeu HF repo ID not configured")
    progress_store.set_progress(task_id, "downloading", 15, "Downloading VieNeu TTS...")
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=VIENEU_HF_REPO, local_dir=str(MODEL_ROOT / "vieneu-tts"), local_dir_use_symlinks=False)
    progress_store.set_progress(task_id, "complete", 100, "VieNeu TTS ready")


def _read_vieneu_dependencies() -> list[str]:
    if not VIENEU_REPO_ROOT.exists():
        raise RuntimeError("VieNeu-TTS repo not found")
    pyproject_path = VIENEU_REPO_ROOT / "pyproject.toml"
    if not pyproject_path.exists():
        raise RuntimeError("VieNeu-TTS pyproject.toml not found")
    data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    project = data.get("project", {})
    deps = project.get("dependencies", [])
    if not isinstance(deps, list):
        raise RuntimeError("Invalid VieNeu-TTS dependencies format")
    return [str(dep) for dep in deps]


def _install_vieneu_deps(task_id: str) -> None:
    if not VIENEU_REPO_ROOT.exists():
        raise RuntimeError("VieNeu-TTS repo not found")

    progress_store.set_progress(task_id, "installing", 10, "Installing VieNeu-TTS dependencies...")
    deps = _read_vieneu_dependencies()
    filtered_deps = []
    for dep in deps:
        if dep.startswith("torch") or dep.startswith("torchaudio"):
            continue
        filtered_deps.append(dep)

    if filtered_deps:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *filtered_deps])

    progress_store.set_progress(task_id, "installing", 70, "Installing VieNeu-TTS package...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-e", str(VIENEU_REPO_ROOT), "--no-deps"])

    torch_status = _torch_status()
    if not torch_status.get("installed"):
        progress_store.add_log(task_id, "PyTorch is not installed. Install 'PyTorch CUDA cu121' from Tools Management.")


def _install_f5(task_id: str) -> None:
    if F5_HF_REPO.startswith("TODO/"):
        raise RuntimeError("F5-TTS HF repo ID not configured")
    progress_store.set_progress(task_id, "downloading", 15, "Downloading F5-TTS...")
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=F5_HF_REPO, local_dir=str(MODEL_ROOT / "f5-tts"), local_dir_use_symlinks=False)
    progress_store.set_progress(task_id, "complete", 100, "F5-TTS ready")


def _install_whisper(task_id: str) -> None:
    progress_store.set_progress(task_id, "downloading", 10, "Downloading Whisper large-v3...")
    import whisper

    model_dir = MODEL_ROOT / "whisper"
    model_dir.mkdir(parents=True, exist_ok=True)
    whisper.load_model("large-v3", download_root=str(model_dir))
    progress_store.set_progress(task_id, "complete", 100, "Whisper model ready")
