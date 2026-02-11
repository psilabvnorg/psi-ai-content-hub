from __future__ import annotations

import importlib.util
import subprocess
import sys
from typing import Dict, List

from fastapi import APIRouter, Body


router = APIRouter(prefix="/api/v1/env", tags=["env"])

_MODULE_TO_PACKAGE: Dict[str, str] = {
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "multipart": "python-multipart",
    "vieneu": "vieneu",
    "neucodec": "neucodec",
    "phonemizer": "phonemizer",
    "librosa": "librosa",
    "onnxruntime": "onnxruntime",
    "soundfile": "soundfile",
}


def _missing_modules() -> List[str]:
    missing = []
    for module in _MODULE_TO_PACKAGE:
        if importlib.util.find_spec(module) is None:
            missing.append(module)
    return missing


@router.get("/status")
def env_status() -> dict:
    missing = _missing_modules()
    return {"installed": len(missing) == 0, "missing": missing}


@router.post("/install")
def env_install(payload: dict = Body(None)) -> dict:
    packages = None
    if payload:
        packages = payload.get("packages")
    if not packages:
        packages = [_MODULE_TO_PACKAGE[name] for name in _missing_modules()]
    if not packages:
        return {"status": "success", "installed": []}
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *packages])
    return {"status": "success", "installed": packages}
