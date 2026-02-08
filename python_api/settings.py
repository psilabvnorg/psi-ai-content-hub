from __future__ import annotations

import os
import tempfile
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]

APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
LOG_DIR = Path(APPDATA) / "psi-ai-content-hub" / "logs"
LOG_FILE = LOG_DIR / "backend.log"
LOG_MAX_BYTES = 5 * 1024 * 1024

TEMP_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

RETENTION_SECONDS = 60 * 60

API_BASE = "http://127.0.0.1:8788"

CORS_ALLOW_ORIGINS = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "file://",
    "null",
]

DOWNLOAD_ROUTE_PREFIX = "/api/download"
