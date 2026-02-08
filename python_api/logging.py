from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .psi_server_utils import log_line
from .settings import LOG_FILE, LOG_MAX_BYTES


def log(message: str, level: str = "info") -> None:
    log_line(LOG_FILE, LOG_MAX_BYTES, message, level)


def read_log_tail(lines: int = 200) -> list[str]:
    if not LOG_FILE.exists():
        return []
    try:
        content = LOG_FILE.read_text(encoding="utf-8", errors="ignore").splitlines()
        return content[-lines:]
    except Exception:
        return []


def stream_log_lines(start_at_end: bool = True) -> Iterable[str]:
    if not LOG_FILE.exists():
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOG_FILE.write_text("", encoding="utf-8")

    with LOG_FILE.open("r", encoding="utf-8", errors="ignore") as handle:
        if start_at_end:
            handle.seek(0, 2)
        while True:
            line = handle.readline()
            if not line:
                yield ""
                continue
            yield line.rstrip("\n")
