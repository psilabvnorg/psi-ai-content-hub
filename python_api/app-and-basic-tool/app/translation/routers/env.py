from __future__ import annotations

import importlib
import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Body


router = APIRouter(prefix="/env", tags=["env"])

VENV_DIR = Path(__file__).resolve().parents[3] / "venv"

_MODULE_TO_PACKAGE: Dict[str, str] = {
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
}


def _missing_modules() -> List[str]:
    missing: List[str] = []
    for module in _MODULE_TO_PACKAGE:
        if importlib.util.find_spec(module) is None:
            missing.append(module)
    return missing


def _installed_modules() -> List[str]:
    installed: List[str] = []
    for module in _MODULE_TO_PACKAGE:
        if importlib.util.find_spec(module) is not None:
            installed.append(module)
    return installed


def _get_venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def _create_venv_if_needed() -> None:
    if not VENV_DIR.exists():
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])


@router.get("/status")
def env_status() -> dict:
    missing = _missing_modules()
    installed = _installed_modules()
    return {
        "installed": len(missing) == 0,
        "missing": missing,
        "installed_modules": installed,
        "python_path": sys.executable,
    }


@router.post("/install")
def env_install(payload: dict = Body(None)) -> dict:
    packages = None
    if payload:
        packages = payload.get("packages")
    if not packages:
        packages = [_MODULE_TO_PACKAGE[name] for name in _missing_modules()]
    if not packages:
        return {"status": "success", "installed": []}

    # Use sys.executable — the running process IS the venv python.
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *packages])

    # Invalidate importlib caches so find_spec() picks up newly installed
    # packages without requiring a server restart.
    importlib.invalidate_caches()

    return {"status": "success", "installed": packages, "python_path": sys.executable}
