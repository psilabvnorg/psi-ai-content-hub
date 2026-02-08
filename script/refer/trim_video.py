#!/usr/bin/env python3
"""
Video Trimming Script
Trims downloaded videos to specified start and end times using ffmpeg.
"""

import argparse
import subprocess
import os
from pathlib import Path


def trim_video(input_path, output_path, start_time, end_time=None, duration=None):
    """
    Trim a video file using ffmpeg.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output trimmed video file
        start_time: Start time in format HH:MM:SS or seconds
        end_time: End time in format HH:MM:SS or seconds (optional)
        duration: Duration from start time in format HH:MM:SS or seconds (optional)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' not found")
        return False
    
    # Build ffmpeg command
    cmd = ['ffmpeg', '-i', input_path, '-ss', str(start_time)]
    
    if end_time:
        cmd.extend(['-to', str(end_time)])
    elif duration:
        cmd.extend(['-t', str(duration)])
    
    # Copy codec for faster processing (no re-encoding)
    cmd.extend(['-c', 'copy', output_path, '-y'])
    
    try:
        print(f"Trimming video: {input_path}")
        print(f"Start: {start_time}", end=", ")
        if end_time:
            print(f"End: {end_time}")
        elif duration:
            print(f"Duration: {duration}")
        else:
            print("(to end of video)")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✓ Successfully trimmed video: {output_path}")
            return True
        else:
            print(f"Error trimming video: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("Error: ffmpeg not found. Please install ffmpeg first.")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Trim downloaded videos using ffmpeg',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Trim from 00:30 to 02:15
  python trim_video.py input.mp4 output.mp4 -s 00:00:30 -e 00:02:15
  
  # Trim 60 seconds starting from 00:30
  python trim_video.py input.mp4 output.mp4 -s 00:00:30 -d 60
  
  # Trim from 30 seconds to end
  python trim_video.py input.mp4 output.mp4 -s 30
        """
    )
    
    parser.add_argument('input', help='Input video file path')
    parser.add_argument('output', help='Output video file path')
    parser.add_argument('-s', '--start', required=True, 
                       help='Start time (HH:MM:SS or seconds)')
    parser.add_argument('-e', '--end', 
                       help='End time (HH:MM:SS or seconds)')
    parser.add_argument('-d', '--duration', 
                       help='Duration from start (HH:MM:SS or seconds)')
    
    args = parser.parse_args()
    
    if args.end and args.duration:
        print("Error: Cannot specify both --end and --duration")
        return 1
    
    success = trim_video(
        args.input,
        args.output,
        args.start,
        args.end,
        args.duration
    )
    
    return 0 if success else 1


if __name__ == '__main__':
    exit(main())


# python scripts/trim_video.py "temp/downloads/202512052357/video.mp4" "temp/downloads/202512052357/trim_video.mp4" -s 00:00:30 -e 00:02:15