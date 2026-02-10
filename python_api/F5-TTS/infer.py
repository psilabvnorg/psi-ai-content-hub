#!/usr/bin/env python3
"""
Python script for F5-TTS inference.
Run TTS inference with custom parameters.
"""

import subprocess
import sys
from pathlib import Path

def run_inference(
    model="F5TTS_Base",
    ref_audio="D:/AI/psi-ai-content-hub/python_api/F5-TTS/ref.wav",
    ref_text="cả hai bên hãy cố gắng hiểu cho nhau",
    gen_text="mình muốn ra nước ngoài để tiếp xúc nhiều công ty lớn, sau đó mang những gì học được về việt nam giúp xây dựng các công trình tốt hơn",
    speed=1.0,
    vocoder_name="vocos",
    vocab_file="C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/f5-tts/vocab.txt",
    ckpt_file="C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/f5-tts/model_last.pt",
    output_dir="output",
    output_file=None
):
    """
    Run F5-TTS inference.
    
    Args:
        model: Model name (F5TTS_Base, F5TTS_Small, etc.)
        ref_audio: Path to reference audio file
        ref_text: Transcription of reference audio
        gen_text: Text to generate speech for
        speed: Speech speed (default: 1.0)
        vocoder_name: Vocoder to use (vocos or bigvgan)
        vocab_file: Path to vocabulary file (optional)
        ckpt_file: Path to checkpoint file (optional)
        output_dir: Output directory
        output_file: Output filename (optional)
    """
    # Build command
    command = [
        "f5-tts_infer-cli",
        "--model", model,
        "--ref_audio", ref_audio,
        "--ref_text", ref_text,
        "--gen_text", gen_text,
        "--speed", str(speed),
        "--vocoder_name", vocoder_name,
    ]
    
    # Add optional parameters
    if vocab_file:
        command.extend(["--vocab_file", vocab_file])
    if ckpt_file:
        command.extend(["--ckpt_file", ckpt_file])
    if output_dir:
        command.extend(["--output_dir", output_dir])
    if output_file:
        command.extend(["--output_file", output_file])
    
    # Check if reference audio exists
    if not Path(ref_audio).exists():
        print(f"❌ Error: Reference audio not found: {ref_audio}")
        sys.exit(1)
    
    # Check if model files exist (if custom)
    if vocab_file and not Path(vocab_file).exists():
        print(f"⚠️  Warning: Vocab file not found: {vocab_file}")
    if ckpt_file and not Path(ckpt_file).exists():
        print(f"⚠️  Warning: Checkpoint file not found: {ckpt_file}")
    
    print("Running F5-TTS inference...")
    print(f"Model: {model}")
    print(f"Reference audio: {ref_audio}")
    print(f"Reference text: {ref_text}")
    print(f"Generating: {gen_text[:50]}...")
    print()
    
    try:

        # Run the command
        result = subprocess.run(command, check=True)
        print("\n✅ Inference complete!")
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error during inference: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Error: f5-tts_infer-cli not found. Make sure F5-TTS is installed.")
        print("   pip install f5-tts")
        sys.exit(1)

def main():
    # Default parameters (same as infer.sh)
    params = {
        "model": "F5TTS_Base",
        "ref_audio": "ref.wav",
        "ref_text": "cả hai bên hãy cố gắng hiểu cho nhau",
        "gen_text": "mình muốn ra nước ngoài để tiếp xúc nhiều công ty lớn, sau đó mang những gì học được về việt nam giúp xây dựng các công trình tốt hơn",
        "speed": 1.0,
        "vocoder_name": "vocos",
        "vocab_file":"C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/f5-tts/vocab.txt",
        "ckpt_file":"C:/Users/ADMIN/AppData/Roaming/psi-ai-content-hub/models/f5-tts/model_last.pt",
        "output_dir": "output",
        "output_file": None
    }
    
    # You can modify parameters here or pass them as arguments
    # Example: Override with command line arguments
    if len(sys.argv) > 1:
        print("Usage: python infer.py")
        print("\nTo customize, edit the parameters in the script or use:")
        print("  python infer.py")
        print("\nOr modify the params dictionary in main()")
        sys.exit(0)
    
    run_inference(**params)

if __name__ == "__main__":
    main()
