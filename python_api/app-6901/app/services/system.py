from __future__ import annotations

import json
import time
from typing import Generator

from python_api.common.logging import read_log_tail, stream_log_lines
from python_api.common.paths import BASE_APP_DIR, MODEL_ROOT, TEMP_DIR
from .tools_manager import get_system_tools_status
from .stt import status as stt_status
from .remove_overlay import model_status as bg_remove_status
from .translation import get_model_status as translation_status


LOG_NAME = "app-service.log"


def get_temp_stats() -> dict:
    total = 0
    file_count = 0
    try:
        for item in TEMP_DIR.rglob("*"):
            if item.is_file():
                file_count += 1
                total += item.stat().st_size
    except Exception:
        pass
    return {"temp_dir": str(TEMP_DIR), "file_count": file_count, "total_size_mb": round(total / (1024 * 1024), 2)}


def get_system_status() -> dict:
    tools_status = get_system_tools_status()
    return {
        "status": "ok",
        "uptime": time.time(),
        "base_app_dir": str(BASE_APP_DIR),
        "temp": get_temp_stats(),
        "tools": tools_status,
        "models": {"shared_root": str(MODEL_ROOT)},
        "services": {
            "whisper": stt_status(),
            "bg_remove_overlay": bg_remove_status(),
            "translation": translation_status(),
            "image_search": {"status": "ok"},
        },
    }


def create_log_stream(log_name: str = LOG_NAME) -> Generator[str, None, None]:
    for line in stream_log_lines(log_name=log_name):
        if not line:
            time.sleep(0.2)
            continue
        yield f"data: {json.dumps({'line': line})}\n\n"


def clear_temp_cache() -> dict:
    removed = 0
    try:
        for item in TEMP_DIR.rglob("*"):
            if item.is_file():
                try:
                    item.unlink()
                    removed += 1
                except Exception:
                    pass
        # Remove empty subdirectories bottom-up
        for item in sorted(TEMP_DIR.rglob("*"), reverse=True):
            if item.is_dir():
                try:
                    item.rmdir()
                except Exception:
                    pass
    except Exception:
        pass
    return {"status": "success", "removed": removed}
