#!/usr/bin/env python3
"""
Synthesize speech from transcription JSON using F5-TTS-Vietnamese.

This script reads a transcription JSON file (from PhoWhisper/Whisper) and
synthesizes speech using F5-TTS with a target speaker's voice.
"""

import json
import subprocess
import sys
import os
from pathlib import Path
import shutil


def synthesize_from_transcription(
    transcription_json,
    ref_audio,
    ref_text,
    output_audio="output/synthesized.wav",
    speed=1.0
):
    """
    Synthesize speech from transcription JSON using F5-TTS.
    
    Args:
        transcription_json: Path to transcription JSON file
        ref_audio: Path to reference audio
        ref_text: Reference text (what the reference audio says)
        output_audio: Output audio file path
        speed: Speech speed (default: 1.0)
    
    Returns:
        str: Path to generated audio file
    """
    # Load transcription
    print(f"Loading transcription from: {transcription_json}")
    with open(transcription_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    gen_text = data['text']
    duration = data.get('duration', 'unknown')
    
    print(f"\n{'='*60}")
    print(f"Transcription Info:")
    print(f"{'='*60}")
    print(f"Duration: {duration}s")
    print(f"Text length: {len(gen_text)} characters")
    print(f"Language: {data.get('language', 'unknown')}")
    print(f"\nText preview:")
    print(gen_text[:300] + "..." if len(gen_text) > 300 else gen_text)
    print(f"{'='*60}\n")
    
    # Create output directory if needed
    output_path = Path(output_audio).absolute()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Prepare F5-TTS command
    # Use the CLI from F5-TTS-Vietnamese venv or fallback to python module
    f5tts_cli = "/home/psilab/F5-TTS-Vietnamese/venv/bin/f5-tts_infer-cli"
    if not Path(f5tts_cli).exists():
        # Fallback: use python module directly
        f5tts_cli = "python"
        cmd = [
            f5tts_cli,
            "-m", "f5_tts.infer.infer_cli",
            "--model", "F5TTS_Base",
            "--ref_audio", ref_audio,
            "--ref_text", ref_text,
            "--gen_text", gen_text,
            "--speed", str(speed),
            "--vocoder_name", "vocos",
            "--vocab_file", "model/vocab.txt",
            "--ckpt_file", "model/model_last.pt",
            "--output_dir", str(output_path.parent),
            "--output_file", output_path.name
        ]
    else:
        cmd = [
            f5tts_cli,
            "--model", "F5TTS_Base",
            "--ref_audio", ref_audio,
            "--ref_text", ref_text,
            "--gen_text", gen_text,
            "--speed", str(speed),
            "--vocoder_name", "vocos",
            "--vocab_file", "model/vocab.txt",
            "--ckpt_file", "model/model_last.pt",
            "--output_dir", str(output_path.parent),
            "--output_file", output_path.name
        ]
    
    # Set up environment
    env = os.environ.copy()
    env["HF_HOME"] = "/home/psilab/.cache/huggingface"
    env["HF_HUB_CACHE"] = "/home/psilab/.cache/huggingface/hub"
    
    # Run F5-TTS
    print("Running F5-TTS synthesis...")
    print(f"Reference audio: {ref_audio}")
    print(f"Target speaker text: {ref_text[:100]}...")
    print(f"Speed: {speed}\n")
    
    result = subprocess.run(
        cmd,
        cwd="/home/psilab/F5-TTS-Vietnamese",
        env=env,
        capture_output=False,
        text=True
    )
    
    if result.returncode == 0:
        print(f"\n{'='*60}")
        print(f"✅ Synthesis complete!")
        print(f"{'='*60}")
        
        # Check if output file was created at the specified location
        if output_path.exists():
            print(f"Output saved to: {output_path}")
            return str(output_path)
        else:
            # Fallback: check default locations if direct output failed
            possible_outputs = [
                Path("/home/psilab/F5-TTS-Vietnamese/tests/infer_cli_basic.wav"),
                Path("/home/psilab/F5-TTS-Vietnamese/test/infer_cli/basic.wav"),
                Path("/home/psilab/F5-TTS-Vietnamese/infer_cli_out.wav"),
            ]
            
            default_output = None
            for possible_output in possible_outputs:
                if possible_output.exists():
                    default_output = possible_output
                    break
            
            if default_output:
                shutil.move(str(default_output), str(output_path))
                print(f"Output moved to: {output_path}")
                return str(output_path)
            else:
                print(f"Warning: Output file not found at {output_path}")
                print(f"Also checked fallback locations without success")
                return None
    else:
        print(f"\n{'='*60}")
        print(f"❌ Synthesis failed with exit code {result.returncode}")
        print(f"{'='*60}")
        sys.exit(1)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Synthesize speech from transcription JSON using F5-TTS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use with default tien_bip speaker
  python scripts/synthesize_from_transcription.py \\
    temp/downloads/*/audio_transcription.json \\
    --ref_audio /home/psilab/F5-TTS-Vietnamese/original_voice_ref/tien_bip/tien_bip2_trimmed.wav \\
    --ref_text "anh ơi đến giờ phút này ý anh ạ"

  # Use with tran_ha_linh speaker
  python scripts/synthesize_from_transcription.py \\
    temp/downloads/*/audio_transcription.json \\
    --ref_audio /home/psilab/F5-TTS-Vietnamese/original_voice_ref/tran_ha_linh/tran_ha_linh_trimmed.wav \\
    --ref_text "chửi tao học ngu đi. chả qua là tao không muốn đi học đại học thôi" \\
    --output temp/synthesized_tran_ha_linh.wav
        """
    )
    
    parser.add_argument(
        "transcription_json",
        help="Path to transcription JSON file (from PhoWhisper/Whisper)"
    )
    parser.add_argument(
        "--ref_audio",
        required=True,
        help="Reference audio file (target speaker's voice)"
    )
    parser.add_argument(
        "--ref_text",
        required=True,
        help="Reference text (transcription of reference audio)"
    )
    parser.add_argument(
        "--output",
        default="output/synthesized.wav",
        help="Output audio file path (default: output/synthesized.wav)"
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Speech speed multiplier (default: 1.0)"
    )
    
    args = parser.parse_args()
    
    # Validate inputs
    transcription_path = Path(args.transcription_json)
    if not transcription_path.exists():
        print(f"Error: Transcription file not found: {transcription_path}")
        sys.exit(1)
    
    ref_audio_path = Path(args.ref_audio)
    if not ref_audio_path.exists():
        print(f"Error: Reference audio not found: {ref_audio_path}")
        sys.exit(1)
    
    # Run synthesis
    output = synthesize_from_transcription(
        str(transcription_path),
        str(ref_audio_path),
        args.ref_text,
        args.output,
        args.speed
    )
    
    if output:
        print(f"\n✓ Success! Generated audio: {output}")
    else:
        print(f"\n✗ Failed to generate audio")
        sys.exit(1)


if __name__ == "__main__":
    main()

# python scripts/synthesize_from_transcription.py temp/downloads/*/audio_transcription.json --ref_audio /home/psilab/F5-TTS-Vietnamese/original_voice_ref/tran_ha_linh/tran_ha_linh_trimmed.wav --ref_text "chửi tao học ngu đi. chả qua là tao không muốn đi học đại học thôi" --output temp/synthesized_tran_ha_linh.wav