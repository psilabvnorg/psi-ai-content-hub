from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse


router = APIRouter(prefix="/api/v1/env", tags=["env"])

VENV_DIR = Path(__file__).resolve().parents[3] / "venv"

_MODULE_TO_PACKAGE: Dict[str, str] = {
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
}

_install_tasks: Dict[str, Dict] = {}
_install_lock = threading.Lock()


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

    task_id = f"install_{uuid.uuid4().hex[:8]}"

    if not packages:
        with _install_lock:
            _install_tasks[task_id] = {"status": "complete", "percent": 100, "logs": ["All packages already installed."]}
        return {"task_id": task_id}

    with _install_lock:
        _install_tasks[task_id] = {"status": "processing", "percent": 5, "logs": []}

    def runner() -> None:
        try:
            _create_venv_if_needed()
            venv_python = _get_venv_python()
            total = max(len(packages), 1)
            collected = 0

            proc = subprocess.Popen(
                [str(venv_python), "-m", "pip", "install", "-U", *packages],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            for line in proc.stdout:  # type: ignore[union-attr]
                line = line.rstrip()
                if not line:
                    continue
                with _install_lock:
                    task = _install_tasks[task_id]
                    task["logs"].append(line)
                    if len(task["logs"]) > 500:
                        task["logs"] = task["logs"][-500:]
                    low = line.lower()
                    if low.startswith("collecting"):
                        collected += 1
                        task["percent"] = min(5 + int(collected / total * 85), 90)

            proc.wait()
            with _install_lock:
                if proc.returncode == 0:
                    _install_tasks[task_id]["status"] = "complete"
                    _install_tasks[task_id]["percent"] = 100
                else:
                    _install_tasks[task_id]["status"] = "error"
                    _install_tasks[task_id]["percent"] = 0
        except Exception as exc:
            with _install_lock:
                _install_tasks[task_id]["status"] = "error"
                _install_tasks[task_id]["logs"].append(str(exc))

    threading.Thread(target=runner, daemon=True).start()
    return {"task_id": task_id}


@router.get("/install/stream/{task_id}")
def env_install_stream(task_id: str) -> StreamingResponse:
    def generate():
        last_count = 0
        while True:
            with _install_lock:
                task = _install_tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'status': 'error', 'percent': 0, 'logs': ['Task not found']})}\n\n"
                break
            logs = task.get("logs", [])
            new_logs = logs[last_count:]
            last_count = len(logs)
            yield f"data: {json.dumps({'status': task['status'], 'percent': task['percent'], 'logs': new_logs})}\n\n"
            if task["status"] in ("complete", "error"):
                break
            time.sleep(0.5)

    return StreamingResponse(generate(), media_type="text/event-stream")
