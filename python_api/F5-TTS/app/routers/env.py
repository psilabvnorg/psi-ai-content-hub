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

_MODULE_TO_PACKAGE: Dict[str, str] = {
    # FastAPI server
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "multipart": "python-multipart",
    # f5-tts package
    "f5_tts": "f5-tts==1.1.17",
    # Dependencies from pyproject.toml
    "accelerate": "accelerate>=0.33.0",
    "bitsandbytes": "bitsandbytes>0.37.0",
    "cached_path": "cached_path",
    "click": "click",
    "datasets": "datasets",
    "ema_pytorch": "ema_pytorch>=0.5.2",
    "gradio": "gradio>=6.0.0",
    "hydra": "hydra-core>=1.3.0",
    "librosa": "librosa",
    "matplotlib": "matplotlib",
    "numpy": "numpy<=1.26.4",
    "pydub": "pydub",
    "pypinyin": "pypinyin",
    "rjieba": "rjieba",
    "safetensors": "safetensors",
    "soundfile": "soundfile",
    "tomli": "tomli",
    "torch": "torch>=2.0.0",
    "torchaudio": "torchaudio>=2.0.0",
    "torchcodec": "torchcodec",
    "torchdiffeq": "torchdiffeq",
    "tqdm": "tqdm>=4.65.0",
    "transformers": "transformers",
    "transformers_stream_generator": "transformers_stream_generator",
    "unidecode": "unidecode",
    "vocos": "vocos",
    "wandb": "wandb",
    "x_transformers": "x_transformers>=1.31.14",
}


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

    # Install packages in the venv (no -U: avoid upgrading already-loaded .pyd files on Windows)
    subprocess.check_call([str(venv_python), "-m", "pip", "install", *packages])

    return {"status": "success", "installed": packages, "venv_path": str(VENV_DIR)}
