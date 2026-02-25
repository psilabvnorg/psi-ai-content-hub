from __future__ import annotations

import subprocess
import sys
import uuid
from pathlib import Path
from typing import List

from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR


_SERVICE_DIR = Path(__file__).parent
_MODELS_DIR = _SERVICE_DIR / "resources" / "models"

if sys.platform == "win32":
    _BIN_PATH = _SERVICE_DIR / "resources" / "win" / "bin" / "upscayl-bin.exe"
elif sys.platform == "darwin":
    _BIN_PATH = _SERVICE_DIR / "resources" / "mac" / "bin" / "upscayl-bin"
else:
    _BIN_PATH = _SERVICE_DIR / "resources" / "linux" / "bin" / "upscayl-bin"


def binary_found() -> bool:
    return _BIN_PATH.exists()


def get_models() -> List[str]:
    if not _MODELS_DIR.exists():
        return []
    return sorted(
        p.stem
        for p in _MODELS_DIR.iterdir()
        if p.suffix == ".param"
    )


def upscale(image_data: bytes, filename: str, model_name: str, scale: int) -> Path:
    if not binary_found():
        raise RuntimeError("upscayl-bin not found")
    bin_path = _BIN_PATH

    uid = uuid.uuid4().hex
    suffix = Path(filename).suffix.lower() or ".png"
    input_path = TEMP_DIR / f"upscale_in_{uid}{suffix}"
    output_path = TEMP_DIR / f"upscale_out_{uid}.png"

    input_path.write_bytes(image_data)

    cmd = [
        str(bin_path),
        "-i", str(input_path),
        "-o", str(output_path),
        "-m", str(_MODELS_DIR),
        "-n", model_name,
        "-s", str(scale),
        "-f", "png",
    ]

    log(f"[upscale] Running: {' '.join(cmd)}", "info", log_name="app-service.log")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    try:
        input_path.unlink(missing_ok=True)
    except Exception:
        pass

    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip()
        log(f"[upscale] Failed: {err}", "error", log_name="app-service.log")
        raise RuntimeError(f"upscayl-bin failed: {err}")

    if not output_path.exists():
        raise RuntimeError("upscayl-bin did not produce output file")

    log(f"[upscale] Done: {output_path}", "info", log_name="app-service.log")
    return output_path
