#!/usr/bin/env python3
"""
Script to download audio from TikTok URL and save as WAV file in input folder.
Requires: yt-dlp, ffmpeg
Install: pip install yt-dlp
"""

import os
import sys
import subprocess
from pathlib import Path

def download_tiktok_audio(url, output_dir="input"):
    """
    Download audio from TikTok URL and convert to WAV format.
    
    Args:
        url: TikTok video URL
        output_dir: Directory to save the audio file (default: "input")
    """
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Output template for the audio file
    output_template = str(output_path / "%(title)s_%(id)s.%(ext)s")
    
    try:
        print(f"Downloading audio from: {url}")
        
        # yt-dlp command to download and convert to WAV
        command = [
            "yt-dlp",
            "-x",  # Extract audio
            "--audio-format", "wav",  # Convert to WAV
            "--audio-quality", "0",  # Best quality
            "-o", output_template,  # Output template
            url
        ]
        
        # Run the command
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        
        print("✅ Download complete!")
        print(f"Audio saved to: {output_dir}/")
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Error downloading audio: {e}")
        print(f"Error output: {e.stderr}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Error: yt-dlp not found. Please install it:")
        print("   pip install yt-dlp")
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python download_tiktok_audio.py <tiktok_url> [output_dir]")
        print("\nExample:")
        print("   python download_tiktok_audio.py https://www.tiktok.com/@user/video/1234567890")
        print("   python download_tiktok_audio.py https://www.tiktok.com/@user/video/1234567890 my_audio_folder")
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "input"
    
    download_tiktok_audio(url, output_dir)

if __name__ == "__main__":
    main()

# python script_utils/download_tiktok_audio.py "https://www.tiktok.com/@tienbry.com/video/7500955962338053383?q=ti%E1%BA%BFn%20b%E1%BB%8Bp%20n%C3%B3i%20%C4%91%E1%BA%A1o%20l%C3%BD&t=1763970677436" "temp"    