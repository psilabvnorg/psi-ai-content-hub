#!/usr/bin/env python3
"""
Script to trim audio file to specified duration.
Requires: pydub, ffmpeg
Install: pip install pydub
"""

import os
import sys
from pathlib import Path
from pydub import AudioSegment

def trim_audio(input_file, start_time=1.0, end_time=40.0, output_dir="temp"):
    """
    Trim audio file from start_time to end_time.
    
    Args:
        input_file: Path to input audio file
        start_time: Start time in seconds (default: 1.0)
        end_time: End time in seconds (default: 40.0)
        output_dir: Directory to save trimmed audio (default: "temp")
    """
    # Check if input file exists
    input_path = Path(input_file)
    if not input_path.exists():
        print(f"❌ Error: Input file not found: {input_file}")
        sys.exit(1)
    
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Output file name
    output_file = output_path / f"{input_path.stem}_trimmed.wav"
    
    try:
        print(f"Loading audio: {input_file}")
        audio = AudioSegment.from_file(str(input_path))
        
        # Get audio duration
        duration_sec = len(audio) / 1000.0
        print(f"Original duration: {duration_sec:.2f} seconds")
        
        # Validate times
        if start_time < 0:
            start_time = 0
        if end_time > duration_sec:
            end_time = duration_sec
            print(f"⚠️  Warning: end_time exceeds audio duration, using {end_time:.2f}s")
        if start_time >= end_time:
            print(f"❌ Error: start_time ({start_time}s) must be less than end_time ({end_time}s)")
            sys.exit(1)
        
        # Convert to milliseconds
        start_ms = int(start_time * 1000)
        end_ms = int(end_time * 1000)
        
        print(f"Trimming from {start_time}s to {end_time}s ({end_time - start_time:.2f}s duration)")
        
        # Trim audio
        trimmed_audio = audio[start_ms:end_ms]
        
        # Add 1 second of silence at the beginning
        silence = AudioSegment.silent(duration=1000)  # 1000ms = 1 second
        trimmed_audio = silence + trimmed_audio + silence + silence
        
        # Export as WAV
        print(f"Saving to: {output_file}")
        trimmed_audio.export(str(output_file), format="wav")
        
        trimmed_duration = len(trimmed_audio) / 1000.0
        print(f"✅ Trim complete!")
        print(f"Trimmed duration: {trimmed_duration:.2f} seconds")
        print(f"Output file: {output_file}")
        
    except Exception as e:
        print(f"❌ Error during trimming: {e}")
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python trim_audio.py <input_file> [start_time] [end_time] [output_dir]")
        print("\nExample:")
        print("   python trim_audio.py huan_rose.wav")
        print("   python trim_audio.py huan_rose.wav 1 40")
        print("   python trim_audio.py huan_rose.wav 1 40 temp")
        print("   python trim_audio.py huan_rose.wav 2.5 30.5 output")
        print("\nDefault: start_time=1s, end_time=40s, output_dir=temp")
        sys.exit(1)
    
    input_file = sys.argv[1]
    start_time = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    end_time = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
    output_dir = sys.argv[4] if len(sys.argv) > 4 else "temp"
    
    trim_audio(input_file, start_time, end_time, output_dir)

if __name__ == "__main__":
    main()


# python script_utils/trim_audio.py temp/huan_rose.wav 27 40