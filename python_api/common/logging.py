from __future__ import annotations

import time
from pathlib import Path
from typing import Iterable

from .paths import LOG_DIR, LOG_MAX_BYTES


def log(message: str, level: str = "info", log_name: str = "backend.log") -> None:
    log_line(LOG_DIR / log_name, LOG_MAX_BYTES, message, level)


def read_log_tail(lines: int = 200, log_name: str = "backend.log") -> list[str]:
    log_file = LOG_DIR / log_name
    if not log_file.exists():
        return []
    try:
        content = log_file.read_text(encoding="utf-8", errors="ignore").splitlines()
        return content[-lines:]
    except Exception:
        return []


def stream_log_lines(log_name: str = "backend.log", start_at_end: bool = True) -> Iterable[str]:
    log_file = LOG_DIR / log_name
    if not log_file.exists():
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file.write_text("", encoding="utf-8")

    with log_file.open("r", encoding="utf-8", errors="ignore") as handle:
        if start_at_end:
            handle.seek(0, 2)
        while True:
            line = handle.readline()
            if not line:
                yield ""
                continue
            yield line.rstrip("\n")


def log_line(log_file: Path, max_bytes: int, message: str, level: str = "info") -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    _rotate_logs(log_file, max_bytes)
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{level.upper()}] {message}"
    print(line, flush=True)
    try:
        with log_file.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        pass


def _rotate_logs(log_file: Path, max_bytes: int) -> None:
    try:
        if log_file.exists() and log_file.stat().st_size > max_bytes:
            backup = log_file.with_suffix(".log.1")
            if backup.exists():
                backup.unlink()
            log_file.rename(backup)
    except Exception:
        pass
