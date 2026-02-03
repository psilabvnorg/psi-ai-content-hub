#!/usr/bin/env python3
"""
YouTube Video Download Module
Part of VidLipSyncVoice Pipeline - Step 1

Downloads YouTube videos with separate video and audio streams for further processing.
"""

import yt_dlp
import argparse
import json
from pathlib import Path
from datetime import datetime
import sys


def sanitize_filename(filename):
    """
    Sanitize filename to remove invalid characters.
    
    Args:
        filename: Original filename
        
    Returns:
        str: Sanitized filename
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename


def download_youtube_video(url, output_dir="input/youtube", verbose=True):
    """
    Download YouTube video with separate audio and video streams.
    
    Args:
        url: YouTube video URL
        output_dir: Directory to save downloads (default: input/youtube)
        verbose: Print progress information
    
    Returns:
        dict: {
            'video': Path to downloaded video file,
            'audio': Path to extracted audio file,
            'thumbnail': Path to thumbnail image,
            'metadata': Path to metadata JSON file,
            'video_id': YouTube video ID,
            'title': Video title,
            'duration': Video duration in seconds
        }
    """
    
    if verbose:
        print(f"Starting download from: {url}")
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # First, get video info to create a proper directory structure
    ydl_opts_info = {
        'quiet': not verbose,
        'no_warnings': not verbose,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
            info = ydl.extract_info(url, download=False)
            video_id = info.get('id', 'unknown')
            video_title = info.get('title', 'unknown')
            duration = info.get('duration', 0)
            uploader = info.get('uploader', 'unknown')
            upload_date = info.get('upload_date', 'unknown')
            
            if verbose:
                print(f"Video ID: {video_id}")
                print(f"Title: {video_title}")
                print(f"Duration: {duration}s ({duration//60}m {duration%60}s)")
                print(f"Uploader: {uploader}")
    
    except Exception as e:
        print(f"Error extracting video info: {e}")
        sys.exit(1)
    
    # Create video-specific directory with timestamp format
    timestamp = datetime.now().strftime("%Y%m%d%H%M")
    video_dir = output_path / timestamp
    video_dir.mkdir(parents=True, exist_ok=True)
    
    # Define output paths
    video_output = video_dir / "video.mp4"
    audio_output = video_dir / "audio.wav"
    thumbnail_output = video_dir / "thumbnail.jpg"
    metadata_output = video_dir / "metadata.json"
    
    # Configure yt-dlp options for video download
    # Prefer H.264 (avc1) over AV1 to avoid ffmpeg compatibility issues
    if verbose:
        print(f"\n[1/3] Downloading video...")
    
    ydl_opts_video = {
        'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': str(video_output),
        'quiet': not verbose,
        'no_warnings': not verbose,
        'merge_output_format': 'mp4',
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts_video) as ydl:
            ydl.download([url])
        if verbose:
            print(f"✓ Video downloaded: {video_output}")
    except Exception as e:
        print(f"Error downloading video: {e}")
        sys.exit(1)
    
    # Download audio separately in WAV format for transcription
    if verbose:
        print(f"\n[2/3] Extracting audio...")
    
    ydl_opts_audio = {
        'format': 'bestaudio/best',
        'outtmpl': str(video_dir / "audio_temp.%(ext)s"),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': not verbose,
        'no_warnings': not verbose,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts_audio) as ydl:
            ydl.download([url])
        
        # Rename the audio file
        temp_audio = video_dir / "audio_temp.wav"
        if temp_audio.exists():
            temp_audio.rename(audio_output)
        
        if verbose:
            print(f"✓ Audio extracted: {audio_output}")
    except Exception as e:
        print(f"Error extracting audio: {e}")
        sys.exit(1)
    
    # Download thumbnail
    if verbose:
        print(f"\n[3/3] Downloading thumbnail...")
    
    ydl_opts_thumbnail = {
        'skip_download': True,
        'writethumbnail': True,
        'outtmpl': str(video_dir / "thumbnail"),
        'quiet': not verbose,
        'no_warnings': not verbose,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts_thumbnail) as ydl:
            ydl.download([url])
        
        # Find and rename thumbnail (yt-dlp might save in various formats)
        for ext in ['.jpg', '.png', '.webp']:
            thumb_file = video_dir / f"thumbnail{ext}"
            if thumb_file.exists():
                if ext != '.jpg':
                    # Convert to jpg if needed (requires PIL/Pillow)
                    try:
                        from PIL import Image
                        img = Image.open(thumb_file)
                        img.convert('RGB').save(thumbnail_output, 'JPEG')
                        thumb_file.unlink()
                    except ImportError:
                        thumb_file.rename(thumbnail_output)
                else:
                    thumb_file.rename(thumbnail_output)
                break
        
        if verbose:
            print(f"✓ Thumbnail saved: {thumbnail_output}")
    except Exception as e:
        if verbose:
            print(f"Warning: Could not download thumbnail: {e}")
    
    # Save metadata
    metadata = {
        'video_id': video_id,
        'title': video_title,
        'duration': duration,
        'uploader': uploader,
        'upload_date': upload_date,
        'url': url,
        'download_timestamp': datetime.now().isoformat(),
        'video_path': str(video_output),
        'audio_path': str(audio_output),
        'thumbnail_path': str(thumbnail_output) if thumbnail_output.exists() else None,
    }
    
    with open(metadata_output, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    if verbose:
        print(f"\n{'='*60}")
        print(f"Download completed successfully!")
        print(f"{'='*60}")
        print(f"Output directory: {video_dir}")
        print(f"Video: {video_output.name}")
        print(f"Audio: {audio_output.name}")
        print(f"Thumbnail: {thumbnail_output.name if thumbnail_output.exists() else 'Not available'}")
        print(f"Metadata: {metadata_output.name}")
        print(f"{'='*60}\n")
    
    return {
        'video': str(video_output),
        'audio': str(audio_output),
        'thumbnail': str(thumbnail_output) if thumbnail_output.exists() else None,
        'metadata': str(metadata_output),
        'video_id': video_id,
        'title': video_title,
        'duration': duration,
        'directory': str(video_dir)
    }


def main():
    """Command-line interface for YouTube video download."""
    parser = argparse.ArgumentParser(
        description='Download YouTube videos for VidLipSyncVoice pipeline',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage
  python scripts/download_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID"
  
  # Specify custom output directory
  python scripts/download_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID" --output temp/downloads
  
  # Quiet mode (minimal output)
  python scripts/download_youtube.py "https://www.youtube.com/watch?v=VIDEO_ID" --quiet
        """
    )
    
    parser.add_argument(
        'url',
        help='YouTube video URL'
    )
    
    parser.add_argument(
        '--output',
        '-o',
        default='input/youtube',
        help='Output directory (default: input/youtube)'
    )
    
    parser.add_argument(
        '--quiet',
        '-q',
        action='store_true',
        help='Suppress verbose output'
    )
    
    args = parser.parse_args()
    
    # Validate URL
    if not ('youtube.com' in args.url or 'youtu.be' in args.url):
        print("Error: Invalid YouTube URL")
        sys.exit(1)
    
    try:
        result = download_youtube_video(
            url=args.url,
            output_dir=args.output,
            verbose=not args.quiet
        )
        
        # Print result as JSON for programmatic use
        if args.quiet:
            print(json.dumps(result, indent=2))
        
        sys.exit(0)
        
    except KeyboardInterrupt:
        print("\n\nDownload interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

# python script/download_youtube_video.py "https://www.youtube.com/watch?v=MDWHjdGObKw" --output temp/downloads