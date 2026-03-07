from __future__ import annotations

import os
import tempfile
from pathlib import Path


APP_DATA_ROOT = Path(
    os.environ.get("PSI_APP_DATA_DIR")
    or os.environ.get("APPDATA")
    or str(Path.home() / ".config")
)
BASE_APP_DIR = APP_DATA_ROOT / "psi-ai-content-hub"

LOG_DIR = BASE_APP_DIR / "logs"
LOG_MAX_BYTES = 10 * 1024 * 1024

TEMP_DIR = Path(os.environ.get("PSI_APP_TEMP_DIR") or (Path(tempfile.gettempdir()) / "psi_ai_content_hub"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

AI_MODELS_DIR = BASE_APP_DIR / "ai-models"
AI_MODELS_DIR.mkdir(parents=True, exist_ok=True)

PROJECTS_DIR = BASE_APP_DIR / "projects"
LIBRARY_DIR = BASE_APP_DIR / "library"
LIBRARY_ASSETS_DIR = LIBRARY_DIR / "assets"
LIBRARY_PACKS_DIR = LIBRARY_DIR / "packs"
EXPORTS_DIR = BASE_APP_DIR / "exports"
SETTINGS_DIR = BASE_APP_DIR / "settings"
DB_DIR = BASE_APP_DIR / "db"

STAGING_ROOT = TEMP_DIR / "staging"
PREVIEW_WORKSPACES_DIR = STAGING_ROOT / "preview"
RENDER_WORKSPACES_DIR = STAGING_ROOT / "render"
CACHE_DIR = TEMP_DIR / "cache"
NORMALIZE_DIR = TEMP_DIR / "normalize"
TRANSCODE_DIR = TEMP_DIR / "transcode"

MODEL_ROOT = AI_MODELS_DIR
MODEL_F5_DIR = AI_MODELS_DIR / "f5-tts"
MODEL_F5_VN_DIR = AI_MODELS_DIR / "f5-tts-vn"
MODEL_F5_EN_DIR = AI_MODELS_DIR / "f5-tts-en"
MODEL_VIENEU_DIR = AI_MODELS_DIR / "vieneu-tts"
MODEL_WHISPER_DIR = AI_MODELS_DIR / "whisper"
MODEL_TRANSLATION_DIR = AI_MODELS_DIR / "translation"
MODEL_BIREFNET_DIR = AI_MODELS_DIR / "birefnet"

MODEL_TRANSLATION_DIR.mkdir(parents=True, exist_ok=True)
MODEL_BIREFNET_DIR.mkdir(parents=True, exist_ok=True)

for _path in (
    LOG_DIR,
    PROJECTS_DIR,
    LIBRARY_ASSETS_DIR,
    LIBRARY_PACKS_DIR,
    EXPORTS_DIR,
    SETTINGS_DIR,
    DB_DIR,
    PREVIEW_WORKSPACES_DIR,
    RENDER_WORKSPACES_DIR,
    CACHE_DIR,
    NORMALIZE_DIR,
    TRANSCODE_DIR,
):
    _path.mkdir(parents=True, exist_ok=True)
