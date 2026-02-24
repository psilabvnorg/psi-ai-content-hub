from __future__ import annotations

import importlib
import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict


# parents: [0]=services, [1]=app, [2]=app-and-basic-tool → venv lives here
aenv_venv_dir_path = Path(__file__).resolve().parents[2] / "venv"

aprofile_module_to_package_map_data: Dict[str, Dict[str, str]] = {
    "app": {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "multipart": "python-multipart",
        "yt_dlp": "yt-dlp",
        "edge_tts": "edge-tts",
    },
    "whisper": {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "multipart": "python-multipart",
        "whisper": "openai-whisper",
        "torch": "torch",
        "numpy": "numpy",
    },
    "translation": {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "multipart": "python-multipart",
        "transformers": "transformers>=4.40.0",
        "torch": "torch",
        "accelerate": "accelerate>=0.27.0",
        "tokenizers": "tokenizers>=0.22.0",
        "safetensors": "safetensors>=0.4.3",
        "huggingface_hub": "huggingface_hub>=0.23.0",
        "sentencepiece": "sentencepiece>=0.2.0",
    },
    "image-search": {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "multipart": "python-multipart",
        "requests": "requests>=2.31.0",
        "selenium": "selenium",
        "undetected_chromedriver": "undetected-chromedriver>=3.5.5",
        "PIL": "pillow",
        "ddgs": "ddgs",
        "dotenv": "python-dotenv",
        "bs4": "beautifulsoup4",
        "lxml": "lxml",
        "webdriver_manager": "webdriver_manager",
        "setuptools": "setuptools",
    },
    "bg-remove-overlay": {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "multipart": "python-multipart",
        "torch": "torch",
        "torchvision": "torchvision",
        "PIL": "pillow",
        "numpy": "numpy",
        "timm": "timm",
        "kornia": "kornia",
        "skimage": "scikit-image",
        "huggingface_hub": "huggingface_hub",
        "transformers": "transformers>=4.39.1",
        "einops": "einops",
        "cv2": "opencv-python",
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
    subprocess.check_call([str(venv_python), "-m", "pip", "install", "-U", *packages_to_install])

    # Invalidate importlib caches so find_spec() picks up newly installed
    # packages without requiring a server restart.
    importlib.invalidate_caches()

    return {
        "profile_id": profile_id,
        "status": "ok",
        "installed_packages": packages_to_install,
        "venv_path": str(aenv_venv_dir_path),
    }
