from __future__ import annotations

import io
import os
import re
import unicodedata
import wave
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

import numpy as np

from python_api.common.paths import MODEL_PIPER_TTS_DIR, TEMP_DIR

_PIPER_DIR = Path(__file__).resolve().parent / "piper_tts"
_FINETUNE_DIR = MODEL_PIPER_TTS_DIR
_MODEL_DIR = _FINETUNE_DIR / "tts-model"
_DEMO_DIR = _PIPER_DIR / "demo"
_ESPEAK_DIR = _FINETUNE_DIR / "eSpeak NG"

# Point phonemizer at the bundled eSpeak NG before it is imported
if _ESPEAK_DIR.exists():
    _espeak_str = str(_ESPEAK_DIR)
    os.environ["PATH"] = _espeak_str + os.pathsep + os.environ.get("PATH", "")
    os.environ["ESPEAK_DATA_PATH"] = str(_ESPEAK_DIR / "espeak-ng-data")

# display name + demo filename for each voice
_VOICE_META: Dict[str, Dict[str, str]] = {
    # Vietnamese
    "vi/banmai":         {"name": "Ban Mai - Thời Sự",          "demo": "ban_mai_demo.wav"},
    "vi/calmwoman3688":  {"name": "Calm Woman",        "demo": ""},
    "vi/chieuthanh":     {"name": "Chiều Thanh",       "demo": "chieu_thanh_demo.wav"},
    "vi/deepman3909":    {"name": "Deep Man",           "demo": ""},
    "vi/duyoryx3175":    {"name": "Duy Oryx",          "demo": "duy_oryx_demo.wav"},
    "vi/lacphi":         {"name": "Lạc Phi",           "demo": "lac_phi_demo.wav"},
    "vi/maiphuong":      {"name": "Mai Phương",        "demo": "mai_phuong_demo.wav"},
    "vi/manhdung":       {"name": "Mạnh Dũng",         "demo": "manh_dung_demo.wav"},
    "vi/minhkhang":      {"name": "Minh Khang - Thời Sự",        "demo": "minh_khang_demo.wav"},
    "vi/minhquang":      {"name": "Minh Quang",        "demo": "minh_quang_demo.wav"},
    "vi/mytam2":         {"name": "Mỹ Tâm",            "demo": "my_tam_demo.wav"},
    "vi/mytam2794":      {"name": "Mỹ Tâm Real",       "demo": "my_tam_real_demo.wav"},
    "vi/ngochuyen":      {"name": "Ngọc Huyền - Review Phim",        "demo": ""},    
    "vi/ngocngan3701":   {"name": "Ngọc Ngân",         "demo": "ngoc_ngan_demo.wav"},
    "vi/phuongtrang":    {"name": "Phương Trang",      "demo": "phuong_trang_demo.wav"},
    "vi/taian2":         {"name": "Tài An",            "demo": "tai_an_demo.wav"},
    "vi/taian4":         {"name": "Tài An 4",          "demo": ""},
    "vi/thanhphuong2":   {"name": "Thanh Phương",      "demo": "thanh_phuong_viettel_demo.wav"},
    "vi/thientam":       {"name": "Thiện Tâm",         "demo": "thien_tam_demo.wav"},
    "vi/tranthanh3870":  {"name": "Trấn Thành",        "demo": "tran_thanh_demo.wav"},
    "vi/vietthao3886":   {"name": "Việt Thảo",         "demo": "viet_thao_demo.wav"},
    # English
    "en/john":           {"name": "John",              "demo": ""},
    "en/mattheo":        {"name": "Mattheo",           "demo": ""},
    "en/mattheo1":       {"name": "Mattheo Alt",       "demo": ""},
    "vi/ngochuyennew":   {"name": "Ngọc Huyền - English",   "demo": "ngoc_huyen_moi_demo.wav"},    
    # Indonesian
    "id/indo_goreng":    {"name": "Indo Goreng",       "demo": ""},
    "id/yannew":         {"name": "Yannew",            "demo": ""},
}

_LANG_DISPLAY = {"vi": "Tiếng Việt", "en": "English", "id": "Indonesia"}

# in-memory model cache:  voice_id -> (session, config)
_model_cache: Dict[str, Tuple] = {}


def _scan_voices() -> List[Dict]:
    """Scan tts-model directory and return voice list with metadata."""
    voices: List[Dict] = []
    if not _MODEL_DIR.exists():
        return voices

    for lang_dir in sorted(_MODEL_DIR.iterdir()):
        if not lang_dir.is_dir():
            continue
        lang = lang_dir.name
        for onnx_file in sorted(lang_dir.glob("*.onnx")):
            model_name = onnx_file.stem
            voice_id = f"{lang}/{model_name}"
            meta = _VOICE_META.get(voice_id, {})
            demo_file = meta.get("demo", "")
            demo_url = f"/api/v1/piper-tts/demo/{demo_file}" if demo_file and (_DEMO_DIR / demo_file).exists() else None
            voices.append({
                "id": voice_id,
                "name": meta.get("name", model_name),
                "language": lang,
                "language_label": _LANG_DISPLAY.get(lang, lang),
                "demo_url": demo_url,
            })
    return voices


def list_voices(language: Optional[str] = None) -> List[Dict]:
    voices = _scan_voices()
    if language:
        voices = [v for v in voices if v["language"] == language]
    return voices


def get_demo_path(filename: str) -> Optional[Path]:
    # Sanitize filename — no path traversal
    safe = Path(filename).name
    path = _DEMO_DIR / safe
    return path if path.exists() and path.suffix == ".wav" else None


def _load_model(voice_id: str) -> Tuple:
    """Load and cache an ONNX model + config for the given voice_id."""
    if voice_id in _model_cache:
        return _model_cache[voice_id]

    import onnxruntime as ort
    import json

    parts = voice_id.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid voice_id: {voice_id}")
    lang, model_name = parts
    onnx_path = _MODEL_DIR / lang / f"{model_name}.onnx"
    config_path = _MODEL_DIR / lang / f"{model_name}.onnx.json"

    if not onnx_path.exists():
        raise FileNotFoundError(f"Model not found: {onnx_path}")
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    _model_cache[voice_id] = (session, config)
    return session, config


def _espeak_exe() -> str:
    """Return path to the bundled espeak-ng.exe, falling back to system espeak-ng."""
    bundled = _ESPEAK_DIR / "espeak-ng.exe"
    return str(bundled) if bundled.exists() else "espeak-ng"


def _espeak_phonemize(text: str, voice: str) -> str:
    """
    Call espeak-ng directly as a subprocess to produce IPA phonemes.
    Equivalent to phonemizer with backend='espeak', with_stress=True.
    """
    import subprocess

    env = os.environ.copy()
    if _ESPEAK_DIR.exists():
        env["ESPEAK_DATA_PATH"] = str(_ESPEAK_DIR / "espeak-ng-data")

    proc = subprocess.run(
        [_espeak_exe(), "-q", "--ipa", "-v", voice],
        input=text,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    return proc.stdout


_LANG_MARKER_RE = re.compile(r'\([a-z]{2}(?:-[a-z]+)?\)', re.IGNORECASE)


def _text_to_phonemes(text: str, config: dict) -> list:
    phoneme_type = config.get("phoneme_type", "espeak")
    if phoneme_type == "text":
        normalized = unicodedata.normalize("NFD", text)
        return list(normalized)

    voice = config.get("espeak", {}).get("voice", "en-us")
    phonemes = _espeak_phonemize(text, voice)
    # Strip language-switch markers espeak inserts when it detects a language
    # change mid-text, e.g. "(en)", "(vi)". These have no phoneme ID in the
    # model's map and would be silently skipped — but any surrounding whitespace
    # they leave can produce extra PAD tokens → audible glitches.
    phonemes = _LANG_MARKER_RE.sub('', phonemes)
    normalized = unicodedata.normalize("NFD", phonemes)
    return list(normalized)


def _phonemes_to_ids(phonemes: list, id_map: dict) -> list:
    BOS, EOS, PAD = "^", "$", "_"
    ids = []
    ids.extend(id_map[BOS])
    ids.extend(id_map[PAD])
    for ph in phonemes:
        if ph in id_map:
            ids.extend(id_map[ph])
            ids.extend(id_map[PAD])
    ids.extend(id_map[EOS])
    return ids


def _run_inference(session, config: dict, text: str, speaker_id: int = 0,
                   length_scale: float = 1.0, noise_scale: float = 0.667,
                   noise_w_scale: float = 0.8) -> np.ndarray:
    id_map = config["phoneme_id_map"]
    phonemes = _text_to_phonemes(text, config)
    phoneme_ids = _phonemes_to_ids(phonemes, id_map)

    input_ids = np.array(phoneme_ids, dtype=np.int64)[np.newaxis, :]
    input_lengths = np.array([len(phoneme_ids)], dtype=np.int64)
    scales = np.array([noise_scale, length_scale, noise_w_scale], dtype=np.float32)

    feeds = {"input": input_ids, "input_lengths": input_lengths, "scales": scales}
    if config.get("num_speakers", 1) > 1:
        feeds["sid"] = np.array([speaker_id], dtype=np.int64)

    results = session.run(None, feeds)
    return results[0].squeeze()


def _normalize_peak(audio: np.ndarray, target: float = 0.9) -> np.ndarray:
    """
    Peak-normalise audio to `target` amplitude (only attenuate, never amplify
    beyond 4×). Different sentences come out at different raw volumes; without
    this, quiet chunks followed by loud chunks sound uneven after concatenation.
    """
    peak = float(np.max(np.abs(audio))) or 1e-9
    gain = min(4.0, target / peak)
    if gain < 1.0:
        audio = audio * gain
    return audio


def _trim_silence(audio: np.ndarray, thresh: float = 0.002, min_samples: int = 480) -> np.ndarray:
    """
    Trim leading/trailing near-zero samples from a chunk, keeping `min_samples`
    of padding so the join doesn't sound clipped. The model pads each output
    with silence; without trimming, concatenated chunks have double-silence gaps.
    """
    above = np.where(np.abs(audio) > thresh)[0]
    if len(above) == 0:
        return audio
    start = max(0, above[0] - min_samples)
    end = min(len(audio), above[-1] + min_samples + 1)
    return audio[start:end]


def _audio_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def generate(text: str, voice_id: str, speed: float = 1.0) -> Tuple[Path, str]:
    """Run Piper TTS and return (output_path, filename)."""
    session, config = _load_model(voice_id)
    sample_rate = config["audio"]["sample_rate"]
    length_scale = 1.0 / max(speed, 0.1)

    audio = _run_inference(session, config, text, length_scale=length_scale)
    wav_bytes = _audio_to_wav_bytes(audio, sample_rate)

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"piper_tts_{uuid4().hex}.wav"
    output_path = TEMP_DIR / filename
    output_path.write_bytes(wav_bytes)
    return output_path, filename


def generate_from_chunks(
    chunks: List[str],
    voice_id: str,
    speed: float = 1.0,
    language: str = "vi",
) -> Tuple[Path, str]:
    """
    Run Piper TTS on each chunk independently and concatenate the audio.

    Per-chunk post-processing:
      - Peak normalisation  (VI target=1.0, EN/other target=0.9)
      - Silence trimming    (EN/other only — VI relies on the '.' pause ID)

    Each chunk is inferred separately so the ONNX model processes one
    sentence at a time — giving better prosody per sentence and ensuring
    the trailing '.' is encoded as its phoneme ID before EOS.
    """
    session, config = _load_model(voice_id)
    sample_rate = config["audio"]["sample_rate"]
    length_scale = 1.0 / max(speed, 0.1)
    is_vi = language == "vi"
    peak_target = 1.0 if is_vi else 0.9

    segments = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        audio = _run_inference(session, config, chunk, length_scale=length_scale)
        if not is_vi:
            audio = _trim_silence(audio)
        audio = _normalize_peak(audio, target=peak_target)
        segments.append(audio)

    if not segments:
        raise ValueError("No audio generated — all chunks were empty")

    combined = np.concatenate(segments)
    wav_bytes = _audio_to_wav_bytes(combined, sample_rate)

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"piper_tts_{uuid4().hex}.wav"
    output_path = TEMP_DIR / filename
    output_path.write_bytes(wav_bytes)
    return output_path, filename
