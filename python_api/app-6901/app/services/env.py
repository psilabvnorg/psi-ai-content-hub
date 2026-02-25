from __future__ import annotations

import importlib.util
import subprocess
import sys
from typing import Dict, List

_MODULE_TO_PACKAGE: Dict[str, str] = {
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "multipart": "python-multipart",
    "yt_dlp": "yt-dlp",
    "edge_tts": "edge-tts",
}


def get_missing_modules() -> List[str]:
    return [m for m in _MODULE_TO_PACKAGE if importlib.util.find_spec(m) is None]


def get_installed_modules() -> List[str]:
    return [m for m in _MODULE_TO_PACKAGE if importlib.util.find_spec(m) is not None]


def get_status() -> dict:
    missing = get_missing_modules()
    installed = get_installed_modules()
    return {"installed": len(missing) == 0, "missing": missing, "installed_modules": installed}


def install_packages(packages: List[str] | None = None) -> dict:
    if not packages:
        packages = [_MODULE_TO_PACKAGE[name] for name in get_missing_modules()]
    if not packages:
        return {"status": "success", "installed": []}
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *packages])
    return {"status": "success", "installed": packages}
