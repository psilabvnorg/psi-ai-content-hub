from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Dict, Iterable, List


@dataclass
class ProgressStore:
    max_logs: int = 200
    _progress: Dict[str, Dict] = field(default_factory=dict)
    _logs: Dict[str, List[str]] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def set_progress(self, task_id: str, status: str, percent: int, message: str = "") -> None:
        with self._lock:
            self._progress[task_id] = {
                "status": status,
                "percent": percent,
                "message": message,
                "updated": time.time(),
            }

    def add_log(self, task_id: str, line: str) -> None:
        with self._lock:
            self._logs.setdefault(task_id, []).append(line)
            if len(self._logs[task_id]) > self.max_logs:
                self._logs[task_id] = self._logs[task_id][-self.max_logs :]

    def get_payload(self, task_id: str, include_logs: bool = True) -> Dict | None:
        with self._lock:
            data = self._progress.get(task_id)
            if not data:
                return None
            payload = dict(data)
            if include_logs:
                payload["logs"] = list(self._logs.get(task_id, []))[-50:]
            return payload

    def sse_stream(self, task_id: str, interval: float = 0.3) -> Iterable[str]:
        while True:
            payload = self.get_payload(task_id, include_logs=True)
            if payload:
                yield f"data: {json.dumps(payload)}\n\n"
                if payload.get("status") in ("complete", "error", "failed", "completed"):
                    break
            else:
                yield f"data: {json.dumps({'status': 'waiting', 'percent': 0, 'message': 'Waiting...'})}\n\n"
            time.sleep(interval)


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
