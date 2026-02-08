#!/usr/bin/env python3
"""
Script to transcribe audio file using Whisper and save transcription to file.
Requires: openai-whisper
Install: pip install openai-whisper
"""

import os
import sys
import whisper
from pathlib import Path

def transcribe_audio(audio_file, output_dir="temp", model_name="base"):
    """
    Transcribe audio file using Whisper.
    
    Args:
        audio_file: Path to audio file (WAV, MP3, etc.)
        output_dir: Directory to save transcription (default: "temp")
        model_name: Whisper model size (tiny, base, small, medium, large)
    """
    # Check if audio file exists
    audio_path = Path(audio_file)
    if not audio_path.exists():
        print(f"❌ Error: Audio file not found: {audio_file}")
        sys.exit(1)
    
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Output transcription file
    output_file = output_path / f"{audio_path.stem}_transcription.txt"
    
    try:
        print(f"Loading Whisper model: {model_name}...")
        model = whisper.load_model(model_name)
        
        print(f"Transcribing: {audio_file}")
        result = model.transcribe(str(audio_path), language="vi", verbose=True)
        
        # Save transcription to file
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(result["text"])
        
        print(f"\n✅ Transcription complete!")
        print(f"Transcription saved to: {output_file}")
        print(f"\nTranscription:\n{result['text']}")
        
    except Exception as e:
        print(f"❌ Error during transcription: {e}")
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe_whisper.py <audio_file> [output_dir] [model_name]")
        print("\nExample:")
        print("   python transcribe_whisper.py tien_bip.wav")
        print("   python transcribe_whisper.py tien_bip.wav temp")
        print("   python transcribe_whisper.py tien_bip.wav temp large")
        print("\nModel options: tiny, base, small, medium, large, large-v2, large-v3")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "temp"
    model_name = sys.argv[3] if len(sys.argv) > 3 else "base"
    
    transcribe_audio(audio_file, output_dir, model_name)

if __name__ == "__main__":
    main()

# python script/transcribe_whisper.py temp/huan_rose.wav temp
