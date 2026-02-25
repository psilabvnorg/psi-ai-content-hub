from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any, Dict, List, Tuple
from uuid import uuid4

from python_api.common.paths import TEMP_DIR


def _get_edge_tts_module() -> Any:
    """
    Lazily import edge_tts so API startup still works even if dependency is missing.
    """
    try:
        return importlib.import_module("edge_tts")
    except Exception as exc:  # pragma: no cover - depends on runtime environment
        raise RuntimeError(
            "edge-tts is not installed in this environment. Install package 'edge-tts' first."
        ) from exc


def _normalize_voice(voice: Dict[str, Any]) -> Dict[str, str]:
    short_name = str(voice.get("ShortName") or "").strip()
    locale = str(voice.get("Locale") or "").strip()
    gender = str(voice.get("Gender") or "").strip()
    friendly_name = str(voice.get("FriendlyName") or short_name).strip()
    return {
        "id": short_name,
        "name": friendly_name,
        "locale": locale,
        "gender": gender,
    }


async def list_voices(language: str | None = None) -> List[Dict[str, str]]:
    edge_tts = _get_edge_tts_module()
    voices_raw = await edge_tts.list_voices()
    language_prefix = (language or "").strip().lower()

    result: List[Dict[str, str]] = []
    for voice in voices_raw:
        normalized = _normalize_voice(voice)
        if not normalized["id"] or not normalized["locale"]:
            continue
        if language_prefix and not normalized["locale"].lower().startswith(language_prefix):
            continue
        result.append(normalized)

    result.sort(key=lambda item: (item["locale"], item["name"]))
    return result


async def list_languages() -> List[Dict[str, Any]]:
    edge_tts = _get_edge_tts_module()
    voices_raw = await edge_tts.list_voices()
    by_code: Dict[str, Dict[str, Any]] = {}

    for voice in voices_raw:
        code = str(voice.get("Locale") or "").strip()
        if not code:
            continue
        if code not in by_code:
            by_code[code] = {
                "code": code,
                "name": str(voice.get("LocaleName") or code).strip(),
                "voice_count": 0,
            }
        by_code[code]["voice_count"] += 1

    result = list(by_code.values())
    result.sort(key=lambda item: str(item["name"]).lower())
    return result


async def synthesize_to_mp3(text: str, voice: str, rate: int = 0, pitch: int = 0) -> Tuple[Path, str]:
    edge_tts = _get_edge_tts_module()
    safe_voice = voice.strip()
    if not safe_voice:
        raise ValueError("voice is required")
    safe_text = text.strip()
    if not safe_text:
        raise ValueError("text is required")

    rate_str = f"{int(rate):+d}%"
    pitch_str = f"{int(pitch):+d}Hz"

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"edge_tts_{uuid4().hex}.mp3"
    output_path = TEMP_DIR / filename
    communicator = edge_tts.Communicate(safe_text, safe_voice, rate=rate_str, pitch=pitch_str)
    await communicator.save(str(output_path))
    return output_path, filename
