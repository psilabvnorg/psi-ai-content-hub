from __future__ import annotations

import json
import logging
import os
import subprocess
import sys

from ..models import ImageResult


LOGGER = logging.getLogger(__name__)

# Worker script path (same directory as this file).
_WORKER_SCRIPT = os.path.join(os.path.dirname(__file__), "_google_worker.py")

# Windows: CREATE_BREAKAWAY_FROM_JOB lets the subprocess escape Electron's
# Job Object so Chrome can create its own child processes without crashing.
_CREATE_BREAKAWAY_FROM_JOB = 0x01000000


def search_google_images(
    query: str,
    max_results: int = 10,
    timeout_seconds: int = 30,
) -> list[ImageResult]:
    """Search Google Images via a detached subprocess running undetected_chromedriver.

    Chrome is launched in a separate process with CREATE_BREAKAWAY_FROM_JOB so it
    escapes Electron's Windows Job Object restrictions that cause the GPU/renderer
    child processes to crash when Chrome is spawned directly from the app server.
    """
    LOGGER.warning(
        "[GoogleSearch] Starting: query=%r, max_results=%d, timeout=%ds",
        query, max_results, timeout_seconds,
    )

    cmd = [
        sys.executable,
        _WORKER_SCRIPT,
        query,
        str(max_results),
        str(timeout_seconds),
    ]

    # Allow extra time for ChromeDriver startup on top of the search timeout.
    proc_timeout = timeout_seconds + 30

    try:
        creation_flags = _CREATE_BREAKAWAY_FROM_JOB if sys.platform == "win32" else 0
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=proc_timeout,
            creationflags=creation_flags,
        )
    except subprocess.TimeoutExpired:
        LOGGER.warning("[GoogleSearch] Worker timed out after %ds", proc_timeout)
        return []
    except Exception as exc:
        LOGGER.warning("[GoogleSearch] Failed to launch worker: %s", exc)
        return []

    if proc.returncode != 0:
        LOGGER.warning(
            "[GoogleSearch] Worker exited with code %d. stderr: %s",
            proc.returncode,
            proc.stderr[:300] if proc.stderr else "",
        )

    # Parse the last JSON line from stdout (worker may print warnings before it).
    output = proc.stdout.strip()
    payload: dict = {}
    for line in reversed(output.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                payload = json.loads(line)
                break
            except json.JSONDecodeError:
                continue

    if not payload:
        LOGGER.warning("[GoogleSearch] No JSON output from worker. stdout=%r", output[:300])
        return []

    if "error" in payload:
        LOGGER.warning("[GoogleSearch] Worker error: %s", payload["error"])

    urls: list[str] = payload.get("urls") or []
    results = [ImageResult(source="google", url=url) for url in urls]

    LOGGER.warning("[GoogleSearch] Complete: returning %d results", len(results))
    return results
