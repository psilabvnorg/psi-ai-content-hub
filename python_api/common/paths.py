from __future__ import annotations

import os
import tempfile
from pathlib import Path


APPDATA = os.environ.get("APPDATA") or str(Path.home() / ".config")
BASE_APP_DIR = Path(APPDATA) / "psi-ai-content-hub"

LOG_DIR = BASE_APP_DIR / "logs"
LOG_MAX_BYTES = 10 * 1024 * 1024

TEMP_DIR = Path(tempfile.gettempdir()) / "psi_ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

MODEL_ROOT = BASE_APP_DIR / "models"

MODEL_F5_DIR = MODEL_ROOT / "f5-tts"
MODEL_F5_VN_DIR = MODEL_ROOT / "f5-tts-vn"
MODEL_F5_EN_DIR = MODEL_ROOT / "f5-tts-en"
MODEL_VIENEU_DIR = MODEL_ROOT / "vieneu-tts"
MODEL_WHISPER_DIR = MODEL_ROOT / "whisper"
MODEL_TRANSLATION_DIR = MODEL_ROOT / "nllb-200-1.3B"
MODEL_BIREFNET_DIR = MODEL_ROOT / "birefnet"
MODEL_PIPER_TTS_DIR = MODEL_ROOT / "piper-tts-finetune"
