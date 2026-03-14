"""
Simple Piper TTS inference script.

Requirements:
    pip install onnxruntime numpy phonemizer

Usage:
    python infer.py --model path/to/model.onnx --text "Hello world" --out out.wav
    python infer.py --model path/to/model.onnx --text "Hello world" --speaker 1 --speed 1.2
"""

import argparse
import json
import unicodedata
import wave
import struct
from pathlib import Path

import numpy as np
import onnxruntime as ort


BOS = "^"
EOS = "$"
PAD = "_"


def load_model(model_path: str, config_path: str = None):
    if config_path is None:
        config_path = model_path + ".json"

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    return session, config


def text_to_phonemes(text: str, config: dict) -> list[str]:
    phoneme_type = config.get("phoneme_type", "espeak")

    if phoneme_type == "text":
        # Text mode: use NFD characters directly (same as JS)
        normalized = unicodedata.normalize("NFD", text)
        return list(normalized)

    # espeak mode: use phonemizer
    from phonemizer import phonemize
    from phonemizer.backend import EspeakBackend

    voice = config.get("espeak", {}).get("voice", "en-us")
    phonemes = phonemize(
        text,
        backend="espeak",
        language=voice,
        with_stress=True,
        language_switch="remove-flags",
    )
    # NFD-normalize and flatten to char list
    normalized = unicodedata.normalize("NFD", phonemes)
    return list(normalized)


def phonemes_to_ids(phonemes: list[str], id_map: dict) -> list[int]:
    ids = []
    ids.extend(id_map[BOS])
    ids.extend(id_map[PAD])

    for ph in phonemes:
        if ph in id_map:
            ids.extend(id_map[ph])
            ids.extend(id_map[PAD])

    ids.extend(id_map[EOS])
    return ids


def run_inference(
    session: ort.InferenceSession,
    config: dict,
    text: str,
    speaker_id: int = 0,
    length_scale: float = 1.0,
    noise_scale: float = 0.667,
    noise_w_scale: float = 0.8,
) -> np.ndarray:
    id_map = config["phoneme_id_map"]
    phonemes = text_to_phonemes(text, config)
    phoneme_ids = phonemes_to_ids(phonemes, id_map)

    print(f"  phonemes : {''.join(phonemes)}")
    print(f"  num ids  : {len(phoneme_ids)}")

    input_ids = np.array(phoneme_ids, dtype=np.int64)[np.newaxis, :]  # [1, seq]
    input_lengths = np.array([len(phoneme_ids)], dtype=np.int64)       # [1]
    scales = np.array([noise_scale, length_scale, noise_w_scale], dtype=np.float32)  # [3]

    feeds = {
        "input": input_ids,
        "input_lengths": input_lengths,
        "scales": scales,
    }

    num_speakers = config.get("num_speakers", 1)
    if num_speakers > 1:
        feeds["sid"] = np.array([speaker_id], dtype=np.int64)

    results = session.run(None, feeds)
    audio = results[0].squeeze()  # Float32 waveform
    return audio


def write_wav(path: str, audio: np.ndarray, sample_rate: int):
    # Clip to [-1, 1] then convert to int16
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767).astype(np.int16)

    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

    print(f"  saved    : {path}  ({len(pcm) / sample_rate:.2f}s)")


def main():
    parser = argparse.ArgumentParser(description="Piper TTS inference")
    parser.add_argument("--model",   required=True, help="Path to .onnx model file")
    parser.add_argument("--config",  default=None,  help="Path to .onnx.json config (default: <model>.json)")
    parser.add_argument("--text",    required=True, help="Text to synthesize")
    parser.add_argument("--out",     default="output.wav", help="Output WAV file")
    parser.add_argument("--speaker", type=int,   default=0,   help="Speaker ID (for multi-speaker models)")
    parser.add_argument("--speed",   type=float, default=1.0, help="Speed multiplier (>1 = faster)")
    parser.add_argument("--noise",   type=float, default=0.667)
    parser.add_argument("--noise-w", type=float, default=0.8)
    args = parser.parse_args()

    length_scale = 1.0 / args.speed  # same formula as JS: 1.0 / speed

    print(f"Loading model : {args.model}")
    session, config = load_model(args.model, args.config)
    sample_rate = config["audio"]["sample_rate"]
    print(f"  sample rate : {sample_rate} Hz")
    print(f"  speakers    : {config.get('num_speakers', 1)}")
    print(f"  phoneme type: {config.get('phoneme_type', 'espeak')}")

    print(f"\nSynthesizing : {args.text!r}")
    audio = run_inference(
        session, config, args.text,
        speaker_id=args.speaker,
        length_scale=length_scale,
        noise_scale=args.noise,
        noise_w_scale=args.noise_w,
    )

    write_wav(args.out, audio, sample_rate)


if __name__ == "__main__":
    main()
