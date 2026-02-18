from __future__ import annotations

import os
import tempfile
from pathlib import Path


APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
BASE_APP_DIR = Path(APPDATA) / "psi-ai-content-hub"

LOG_DIR = BASE_APP_DIR / "logs"
LOG_MAX_BYTES = 5 * 1024 * 1024

TEMP_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

MODEL_ROOT = BASE_APP_DIR / "models"
MODEL_ROOT.mkdir(parents=True, exist_ok=True)

MODEL_F5_DIR = MODEL_ROOT / "f5-tts"
MODEL_VIENEU_DIR = MODEL_ROOT / "vieneu-tts"
MODEL_WHISPER_DIR = MODEL_ROOT / "whisper"
MODEL_TRANSLATION_DIR = MODEL_ROOT / "translation"

MODEL_TRANSLATION_DIR.mkdir(parents=True, exist_ok=True)
