from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
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
