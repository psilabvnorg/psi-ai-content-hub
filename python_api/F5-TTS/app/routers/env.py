from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Body


router = APIRouter(prefix="/api/v1/env", tags=["env"])

# Path to the venv directory relative to this file
VENV_DIR = Path(__file__).parent.parent.parent / "venv"

_TORCH_INDEX_URL = "https://download.pytorch.org/whl/cu124"

_MODULE_TO_PACKAGE: Dict[str, str] = {
    # FastAPI server
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "multipart": "python-multipart",
    # numpy
    "numpy": "numpy==1.26.4",
    # torch (CUDA build — installed with extra index url)
    "torch": "torch==2.4.0+cu124",
    "torchaudio": "torchaudio==2.4.0+cu124",
    # F5-TTS core (pulls in all sub-dependencies)
    "f5_tts": "f5-tts",
}

# Packages that require the PyTorch CUDA index to resolve
_TORCH_PACKAGES = {"torch==2.4.0+cu124", "torchaudio==2.4.0+cu124"}


def _missing_modules() -> List[str]:
    missing = []
    for module in _MODULE_TO_PACKAGE:
        if importlib.util.find_spec(module) is None:
            missing.append(module)
    return missing


def _installed_modules() -> List[str]:
    installed = []
    for module in _MODULE_TO_PACKAGE:
        if importlib.util.find_spec(module) is not None:
            installed.append(module)
    return installed


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


def _get_venv_python() -> Path:
    """Get the path to the Python executable in the venv."""
    if os.name == "nt":  # Windows
        return VENV_DIR / "Scripts" / "python.exe"
    else:  # Unix/Linux/Mac
        return VENV_DIR / "bin" / "python"


def _create_venv_if_needed() -> None:
    """Create virtual environment if it doesn't exist."""
    if not VENV_DIR.exists():
        print(f"Creating virtual environment at {VENV_DIR}")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])


@router.post("/install")
def env_install(payload: dict = Body(None)) -> dict:
    packages = None
    if payload:
        packages = payload.get("packages")
    if not packages:
        packages = [_MODULE_TO_PACKAGE[name] for name in _missing_modules()]
    if not packages:
        return {"status": "success", "installed": []}

    # Create venv if it doesn't exist
    _create_venv_if_needed()

    # Get the venv Python executable
    venv_python = _get_venv_python()

    # Upgrade pip first to ensure modern resolver and wheel support
    subprocess.check_call([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"])

    # Split packages: torch CUDA builds need an extra index URL
    torch_pkgs = [p for p in packages if p in _TORCH_PACKAGES]
    other_pkgs = [p for p in packages if p not in _TORCH_PACKAGES]

    if other_pkgs:
        subprocess.check_call([str(venv_python), "-m", "pip", "install", *other_pkgs])

    if torch_pkgs:
        subprocess.check_call([
            str(venv_python), "-m", "pip", "install",
            "--extra-index-url", _TORCH_INDEX_URL,
            *torch_pkgs,
        ])

    return {"status": "success", "installed": packages, "venv_path": str(VENV_DIR)}
