#!/usr/bin/env python3
"""
Minimal script to load F5-TTS and synthesize a Vietnamese sample with a reference voice.
- Reference audio: data/voice_refs/vi_female.wav
- Input text: "Sang 10/1, tai duong Le Quang Dao, Bo Cong an to chuc le xuat quan va dien tap bao dam an ninh, trat tu phuc vu Dai hoi dai bieu toan quoc lan thu 14 cua Dang"
"""

import argparse
from pathlib import Path
import sys
import torch

try:
    from f5_tts.api import F5TTS
    import soundfile as sf
except ImportError as exc:
    print("F5-TTS is not installed. Install with: pip install f5-tts")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Generate a sample voice using F5-TTS")
    parser.add_argument("--model", default="F5TTS_Base", help="Model name (default: F5TTS_Base)")
    parser.add_argument("--ckpt_file", default=None, help="Optional checkpoint file")
    parser.add_argument(
        "--vocab_file",
        default="/home/psilab/F5-TTS-Vietnamese/model/vocab.txt",
        help="Vocabulary file (required for custom checkpoints)",
    )
    parser.add_argument("--vocoder", default="vocos", help="Vocoder (vocos or bigvgan)")
    parser.add_argument("--device", default="auto", help="Device to run on (auto/cuda/cpu)")
    parser.add_argument("--ref_audio", default="data/voice_refs/vi_female.wav", help="Reference audio path")
    parser.add_argument("--ref_text", default="mời quý khán giả theo dõi bản tin của đài truyền hình việt nam, tỉnh khánh hòa và tỉnh đắc lắc hưởng ứng chiến dịch quang trung thần tốc xây dựng, và sửa chữa nhà cho các hộ dân bị thiệt hại sau lũ, khánh hòa khởi công", help="Transcription of the reference audio")
    parser.add_argument(
        "--gen_text",
        default=(
            "Sáng 10/1, tại đường Lê Quang Đạo, Bộ Công an tổ chức lễ xuất quân và diễn tập "
            "bảo đảm an ninh, trật tự phục vụ Đại hội đại biểu toàn quốc lần thứ 14 của Đảng"
        ),
        help="Text to synthesize",
    )
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--output", default="output/f5tts_vi_sample.wav", help="Output wav path")
    return parser.parse_args()


def main():
    args = parse_args()

    ref_audio = Path(args.ref_audio)
    if not ref_audio.exists():
        print(f"Reference audio not found: {ref_audio}")
        sys.exit(1)

    vocab_file = Path(args.vocab_file) if args.vocab_file else None
    if vocab_file is None or not vocab_file.exists():
        print(f"Vocab file not found or not set: {vocab_file}")
        print("Provide --vocab_file pointing to vocab.txt")
        sys.exit(1)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Resolve device: convert 'auto' to cuda if available else cpu
    if args.device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device = args.device

    print(f"Loading F5-TTS model on device={device}...")
    # Some package versions don't accept vocoder_name; pass minimal args
    tts = F5TTS(
        model=args.model,
        ckpt_file=args.ckpt_file,
        vocab_file=str(vocab_file),
        device=device,
    )
    print("Model loaded.")

    print("Generating audio...")
    result = tts.infer(
        ref_file=str(ref_audio),
        ref_text=args.ref_text,
        gen_text=args.gen_text,
        speed=args.speed,
    )
    
    # Handle different return formats from F5TTS.infer()
    if isinstance(result, tuple):
        if len(result) == 3:
            wav, sr, _ = result  # (wav, sr, spectrogram)
        elif len(result) == 2:
            wav, sr = result
        else:
            raise ValueError(f"Unexpected return format from F5TTS.infer(): {len(result)} values")
    else:
        raise ValueError("Expected tuple return from F5TTS.infer()")

    sf.write(out_path, wav, sr)
    print(f"Done. Saved to {out_path}")


if __name__ == "__main__":
    main()
