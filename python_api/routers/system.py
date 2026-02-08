from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse

from ..logging import log, read_log_tail, stream_log_lines
from ..settings import LOG_FILE, TEMP_DIR
from ..deps import get_job_store
from ..services.jobs import JobStore
from ..services.stt import status as stt_status
from ..services.tts import get_model_configs
from ..services.voice_clone import list_voices
from ..services.tools_manager import get_system_tools_status


router = APIRouter(prefix="/api/system", tags=["system"])
download_router = APIRouter(prefix="/api", tags=["download"])


def _temp_stats() -> dict:
    total = 0
    file_count = 0
    try:
        for item in TEMP_DIR.iterdir():
            if item.is_file():
                file_count += 1
                total += item.stat().st_size
    except Exception:
        pass
    return {"temp_dir": str(TEMP_DIR), "file_count": file_count, "total_size_mb": round(total / (1024 * 1024), 2)}


@router.get("/status")
def status() -> dict:
    tools_status = get_system_tools_status()
    return {
        "status": "ok",
        "uptime": time.time(),
        "temp": _temp_stats(),
        "tools": {
            "ffmpeg": tools_status.get("ffmpeg", _check_tool("ffmpeg")),
            "yt_dlp": tools_status.get("yt_dlp", _check_tool("yt-dlp")),
            "torch": tools_status.get("torch"),
            "vieneu_tts": tools_status.get("vieneu_tts"),
            "vieneu_tts_deps": tools_status.get("vieneu_tts_deps"),
            "f5_tts": tools_status.get("f5_tts"),
            "whisper": tools_status.get("whisper"),
            "tts": {"configs": bool(get_model_configs().get("backbones"))},
            "voice_clone": {"voices": len(list_voices().get("voices", []))},
            "stt": stt_status(),
        },
    }


@router.get("/version")
def version() -> dict:
    version = _read_package_version()
    return {
        "version": version,
        "git_hash": _read_git_hash(),
    }


@router.post("/reload")
def reload_configs() -> dict:
    return {"status": "ok"}


@router.get("/logs/tail")
def logs_tail(lines: int = 200) -> dict:
    return {"lines": read_log_tail(lines)}


def _log_stream() -> Iterable[str]:
    for line in stream_log_lines():
        if not line:
            time.sleep(0.2)
            continue
        yield f"data: {json.dumps({'line': line})}\n\n"


@router.get("/logs/stream")
def logs_stream() -> StreamingResponse:
    return StreamingResponse(_log_stream(), media_type="text/event-stream")


@router.post("/start")
def start_backend() -> dict:
    return {"status": "already_running"}


@router.post("/stop")
def stop_backend() -> dict:
    def _shutdown() -> None:
        time.sleep(0.3)
        os._exit(0)

    import threading

    threading.Thread(target=_shutdown, daemon=True).start()
    return {"status": "stopping"}


@download_router.get("/download/{file_id}")
def download(file_id: str, job_store: JobStore = Depends(get_job_store)) -> Response:
    record = job_store.get_file(file_id)
    if not record or not record.path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=record.path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={record.filename}"},
    )


def _check_tool(name: str) -> dict:
    from shutil import which

    return {"installed": which(name) is not None}


def _read_package_version() -> str:
    pkg_path = Path(__file__).resolve().parents[2] / "package.json"
    if not pkg_path.exists():
        return "unknown"
    try:
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
        return data.get("version", "unknown")
    except Exception:
        return "unknown"


def _read_git_hash() -> str | None:
    git_head = Path(__file__).resolve().parents[2] / ".git" / "HEAD"
    if not git_head.exists():
        return None
    try:
        ref = git_head.read_text(encoding="utf-8").strip()
        if ref.startswith("ref:"):
            ref_path = ref.split(" ", 1)[1]
            ref_file = Path(__file__).resolve().parents[2] / ".git" / ref_path
            if ref_file.exists():
                return ref_file.read_text(encoding="utf-8").strip()
        return ref
    except Exception:
        return None
