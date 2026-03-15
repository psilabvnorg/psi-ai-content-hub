from __future__ import annotations

import importlib
import importlib.util
import os
import shutil
import subprocess
import sys
import threading
import uuid
from pathlib import Path
from typing import Callable, Dict

from python_api.common.logging import log
from python_api.common.progress import ProgressStore

# parents: [0]=services, [1]=app, [2]=app-6901, [3]=python_api, [4]=repo root
_REPO_ROOT = Path(__file__).resolve().parents[4]
REMOTION_ROOT = _REPO_ROOT / "remotion"


# parents: [0]=services, [1]=app, [2]=app-6901 → venv lives here
aenv_venv_dir_path = Path(__file__).resolve().parents[2] / "venv"

aprofile_module_to_package_map_data: Dict[str, Dict[str, str]] = {
    "app": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "yt_dlp": "yt-dlp==2026.2.21",
        "edge_tts": "edge-tts==7.2.7",
    },
    "piper-tts": {
        "onnxruntime": "onnxruntime==1.24.3",
        "numpy": "numpy==2.4.2",
    },
    "whisper": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "whisper": "openai-whisper==20250625",
        "torch": "torch==2.6.0+cu124",
        "torchaudio": "torchaudio==2.6.0+cu124",
        "numpy": "numpy==2.4.2",
        "stable_whisper": "stable-ts==2.19.1",
    },
    "translation": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "transformers": "transformers==5.2.0",
        "torch": "torch==2.6.0+cu124",
        "numpy": "numpy==2.4.2",
        "accelerate": "accelerate==1.12.0",
        "tokenizers": "tokenizers==0.22.2",
        "safetensors": "safetensors==0.7.0",
        "huggingface_hub": "huggingface_hub==1.4.1",
        "sentencepiece": "sentencepiece==0.2.1",
    },
    "image-search": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "requests": "requests==2.32.5",
        "selenium": "selenium==4.41.0",
        "undetected_chromedriver": "undetected-chromedriver==3.5.5",
        "PIL": "pillow==12.1.1",
        "ddgs": "ddgs==9.10.0",
        "dotenv": "python-dotenv==1.2.1",
        "bs4": "beautifulsoup4==4.14.3",
        "lxml": "lxml==6.0.2",
        "webdriver_manager": "webdriver-manager==4.0.2",
        "setuptools": "setuptools==82.0.0",
    },
    "bg-remove-overlay": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "torch": "torch==2.6.0+cu124",
        "torchvision": "torchvision==0.21.0+cu124",
        "PIL": "pillow==12.1.1",
        "numpy": "numpy==2.4.2",
        "timm": "timm==1.0.25",
        "kornia": "kornia==0.8.2",
        "skimage": "scikit-image==0.26.0",
        "huggingface_hub": "huggingface_hub==1.4.1",
        "transformers": "transformers==5.2.0",
        "einops": "einops==0.8.2",
        "cv2": "opencv-python==4.13.0.92",
    },
    "thumbnail-simple": {
        "fastapi": "fastapi==0.133.0",
        "uvicorn": "uvicorn==0.41.0",
        "multipart": "python-multipart==0.0.22",
        "numpy": "numpy==2.4.2",
        "PIL": "pillow==12.1.1",
        "sklearn": "scikit-learn==1.8.0",
    },
}


def aenv_get_profile_catalog_data() -> list[dict[str, object]]:
    return [
        {
            "profile_id": profile_id,
            "module_count": len(module_map),
            "module_names": sorted(module_map.keys()),
        }
        for profile_id, module_map in aprofile_module_to_package_map_data.items()
    ]


def aenv_get_profile_module_map_data(profile_id: str) -> Dict[str, str]:
    profile_map = aprofile_module_to_package_map_data.get(profile_id)
    if profile_map is None:
        raise KeyError(f"Unknown profile_id: {profile_id}")
    return profile_map


def aenv_get_profile_status_data(profile_id: str) -> dict[str, object]:
    module_map = aenv_get_profile_module_map_data(profile_id)
    installed_modules: list[str] = []
    missing_modules: list[str] = []
    for module_name in module_map:
        if importlib.util.find_spec(module_name) is None:
            missing_modules.append(module_name)
        else:
            installed_modules.append(module_name)
    return {
        "profile_id": profile_id,
        "installed": len(missing_modules) == 0,
        "missing_modules": missing_modules,
        "installed_modules": installed_modules,
        "python_path": sys.executable,
    }


def aenv_get_venv_python_path_data() -> Path:
    if os.name == "nt":
        return aenv_venv_dir_path / "Scripts" / "python.exe"
    return aenv_venv_dir_path / "bin" / "python"


def aenv_ensure_venv_ready_data() -> None:
    if not aenv_venv_dir_path.exists():
        subprocess.check_call([sys.executable, "-m", "venv", str(aenv_venv_dir_path)])


def aenv_install_profile_data(profile_id: str, packages: list[str] | None = None) -> dict[str, object]:
    module_map = aenv_get_profile_module_map_data(profile_id)
    packages_to_install = packages
    if not packages_to_install:
        missing_modules = [
            module_name for module_name in module_map if importlib.util.find_spec(module_name) is None
        ]
        packages_to_install = [module_map[module_name] for module_name in missing_modules]
    if not packages_to_install:
        return {"profile_id": profile_id, "status": "ok", "installed_packages": []}

    aenv_ensure_venv_ready_data()
    venv_python = aenv_get_venv_python_path_data()

    # Remove corrupted/partial torch distributions (pip marks them as "~orch")
    # left behind by interrupted installs — they override the new install's files.
    if any("torch" in pkg for pkg in packages_to_install):
        site_packages = aenv_venv_dir_path / "Lib" / "site-packages"
        for broken in site_packages.glob("~orch*"):
            try:
                if broken.is_dir():
                    shutil.rmtree(broken)
                else:
                    broken.unlink()
            except Exception:
                pass

    # Add PyTorch CUDA index URL when any package requires a +cu build.
    # If the CUDA install fails (e.g. no NVIDIA GPU), fall back to CPU-only packages.
    _PYTORCH_CUDA_INDEX = "https://download.pytorch.org/whl/cu124"
    needs_cuda_index = any("+cu" in pkg for pkg in packages_to_install)
    extra_args = ["--extra-index-url", _PYTORCH_CUDA_INDEX] if needs_cuda_index else []

    try:
        subprocess.check_call([str(venv_python), "-m", "pip", "install", "-U", *extra_args, *packages_to_install])
    except subprocess.CalledProcessError:
        if needs_cuda_index:
            # Strip +cu version pins and retry without the CUDA index
            cpu_packages = [pkg.split("+")[0] if "+cu" in pkg else pkg for pkg in packages_to_install]
            subprocess.check_call([str(venv_python), "-m", "pip", "install", "-U", *cpu_packages])
        else:
            raise

    # Invalidate importlib caches so find_spec() picks up newly installed
    # packages without requiring a server restart.
    importlib.invalidate_caches()

    return {
        "profile_id": profile_id,
        "status": "ok",
        "installed_packages": packages_to_install,
        "venv_path": str(aenv_venv_dir_path),
    }


_remotion_deps_lock = threading.Lock()
_remotion_deps_ready = False

setup_progress_store = ProgressStore()


def get_remotion_setup_status() -> dict[str, object]:
    """Return Node.js, npm, and remotion node_modules installation status.

    Uses shell=True on Windows so cmd.exe's full system PATH is searched,
    which fixes detection when the Electron service process inherits a
    restricted PATH that excludes the Node.js installation directory.
    """
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    _shell = os.name == "nt"

    # Prefer shutil.which for the canonical path, but always try subprocess
    # so that node is detected even when shutil.which misses it (restricted PATH).
    node_path: str | None = shutil.which("node")
    npm_path: str | None = shutil.which(npm_cmd)

    node_version: str | None = None
    npm_version: str | None = None

    try:
        r = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=5, shell=_shell
        )
        if r.returncode == 0:
            node_version = r.stdout.strip() or None
            if node_path is None:
                node_path = "node"  # reachable via shell PATH, not shutil.which
    except Exception:
        pass

    try:
        r = subprocess.run(
            [npm_cmd, "--version"], capture_output=True, text=True, timeout=5, shell=_shell
        )
        if r.returncode == 0:
            npm_version = r.stdout.strip() or None
            if npm_path is None:
                npm_path = npm_cmd
    except Exception:
        pass

    # Accept node_modules as installed if @remotion/ exists OR if the
    # directory is non-empty (covers partial installs / different layouts).
    node_modules_dir = REMOTION_ROOT / "node_modules"
    remotion_deps = (node_modules_dir / "@remotion").exists() or (
        node_modules_dir.is_dir() and next(node_modules_dir.iterdir(), None) is not None
    )

    return {
        "node_installed": node_path is not None,
        "node_version": node_version,
        "node_path": node_path,
        "npm_installed": npm_path is not None,
        "npm_version": npm_version,
        "remotion_deps_installed": remotion_deps,
        "remotion_root": str(REMOTION_ROOT),
    }


def start_remotion_deps_install() -> str:
    """Run `npm install` in REMOTION_ROOT and stream progress via setup_progress_store."""
    task_id = f"remotion_setup_{uuid.uuid4().hex}"
    setup_progress_store.set_progress(task_id, "starting", 0, "Starting npm install...")

    def runner() -> None:
        global _remotion_deps_ready
        try:
            npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

            if not (REMOTION_ROOT / "package.json").exists():
                raise RuntimeError(f"remotion/package.json not found at {REMOTION_ROOT}")

            try:
                process = subprocess.Popen(
                    [npm_cmd, "install"],
                    cwd=str(REMOTION_ROOT),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    shell=(os.name == "nt"),
                )
            except FileNotFoundError:
                raise RuntimeError("npm not found. Please install Node.js from https://nodejs.org/ and restart.")

            setup_progress_store.set_progress(task_id, "processing", 10, "Running npm install...")

            if process.stdout:
                for raw_line in process.stdout:
                    line = raw_line.strip()
                    if line:
                        setup_progress_store.add_log(task_id, line)

            return_code = process.wait()
            if return_code != 0:
                raise RuntimeError(f"npm install failed with exit code {return_code}")

            _remotion_deps_ready = True
            setup_progress_store.set_progress(task_id, "complete", 100, "Remotion dependencies installed successfully.")
            log("Remotion npm dependencies installed.", "info", log_name="app-service.log")
        except Exception as exc:
            setup_progress_store.add_log(task_id, f"[ERROR] {exc}")
            setup_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Remotion deps install failed: {exc}", "error", log_name="app-service.log")

    threading.Thread(target=runner, daemon=True).start()
    return task_id



