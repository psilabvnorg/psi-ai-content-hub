#!/usr/bin/env python3
"""
FastAPI Backend for AI Content Hub Tools
Provides endpoints for video/audio downloading, conversion, and TTS
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl, Field
from typing import Optional, Literal
import os
import sys
import tempfile
import subprocess
import shutil
from pathlib import Path
import time
import json
from datetime import datetime
import yt_dlp
from pydub import AudioSegment
import logging
import asyncio
from collections import defaultdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('api.log')
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Content Hub API",
    version="1.0.0",
    description="Fast API for video/audio tools and TTS"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temp directory for downloads
TEMP_DIR = Path(tempfile.gettempdir()) / "ai_content_hub"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Progress tracking for downloads
progress_store = defaultdict(dict)

# Cleanup old files on startup
def cleanup_old_files():
    """Remove files older than 1 hour"""
    current_time = time.time()
    for file_path in TEMP_DIR.glob("*"):
        if file_path.is_file():
            if current_time - file_path.stat().st_mtime > 3600:
                try:
                    file_path.unlink()
                except:
                    pass

cleanup_old_files()


# ============= MODELS =============
class DownloadVideoRequest(BaseModel):
    url: HttpUrl = Field(..., description="Video URL to download")
    platform: Literal["tiktok", "youtube", "facebook", "instagram"] = Field(..., description="Platform type")


class ExtractAudioRequest(BaseModel):
    video_path: str = Field(..., description="Path to video file")
    format: Literal["mp3", "wav"] = Field(default="mp3", description="Output audio format")


class ConvertAudioRequest(BaseModel):
    audio_path: str = Field(..., description="Path to audio file")
    output_format: Literal["wav", "mp3"] = Field(..., description="Target format")


class TrimVideoRequest(BaseModel):
    video_path: str = Field(..., description="Path to video file")
    start_time: str = Field(..., description="Start time (HH:MM:SS or seconds)")
    end_time: Optional[str] = Field(None, description="End time (HH:MM:SS or seconds)")
    duration: Optional[str] = Field(None, description="Duration from start")


class AdjustSpeedRequest(BaseModel):
    video_path: str = Field(..., description="Path to video file")
    speed: float = Field(..., ge=0.5, le=2.0, description="Speed multiplier (0.5-2.0)")


# ============= HELPER FUNCTIONS =============
def generate_filename(prefix: str, extension: str) -> Path:
    """Generate unique filename"""
    timestamp = int(time.time() * 1000)
    return TEMP_DIR / f"{prefix}_{timestamp}.{extension}"


def cleanup_file(file_path: str):
    """Background task to cleanup file"""
    try:
        Path(file_path).unlink(missing_ok=True)
    except:
        pass


# ============= ENDPOINTS =============
@app.get("/")
async def root():
    return {
        "service": "AI Content Hub API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/test_progress.html")
async def test_progress_page():
    """Serve the test progress HTML page"""
    html_path = Path(__file__).parent / "test_progress.html"
    if html_path.exists():
        return FileResponse(html_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="Test page not found")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/progress/{download_id}")
async def get_progress_stream(download_id: str):
    """
    Server-Sent Events endpoint for real-time download progress
    """
    async def event_generator():
        try:
            while True:
                if download_id in progress_store:
                    progress_data = progress_store[download_id]
                    yield f"data: {json.dumps(progress_data)}\n\n"
                    
                    # Stop streaming if complete or error
                    if progress_data.get('status') in ['complete', 'error']:
                        # Clean up after 5 seconds
                        await asyncio.sleep(5)
                        if download_id in progress_store:
                            del progress_store[download_id]
                        break
                else:
                    yield f"data: {json.dumps({'status': 'waiting', 'message': 'Waiting for download to start...'})}\n\n"
                
                await asyncio.sleep(0.5)  # Update every 500ms
        except asyncio.CancelledError:
            # Client disconnected
            pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/download/video")
async def download_video(request: DownloadVideoRequest, background_tasks: BackgroundTasks):
    """
    Download video from TikTok, YouTube, Facebook, or Instagram
    Returns download_id immediately for progress tracking
    """
    # Generate unique download ID
    download_id = f"download_{int(time.time() * 1000)}"
    
    logger.info(f"=== Starting video download ===")
    logger.info(f"Download ID: {download_id}")
    logger.info(f"URL: {request.url}")
    logger.info(f"Platform: {request.platform}")
    
    # Initialize progress
    progress_store[download_id] = {
        'status': 'starting',
        'message': 'Initializing download...'
    }
    
    # Start download in background
    background_tasks.add_task(download_video_task, download_id, str(request.url), request.platform)
    
    # Return immediately with download_id
    return {
        "status": "started",
        "download_id": download_id,
        "message": "Download started. Use /api/progress/{download_id} to track progress."
    }


def download_video_task(download_id: str, url: str, platform: str):
    """Background task to download video"""
def download_video_task(download_id: str, url: str, platform: str):
    """Background task to download video"""
    try:
        temp_download = generate_filename(f"{platform}_temp", "mp4")
        output_file = generate_filename(f"{platform}_video", "mp4")
        
        logger.info(f"Temp file: {temp_download}")
        logger.info(f"Output file: {output_file}")
        
        # Progress hook for yt-dlp
        def progress_hook(d):
            if d['status'] == 'downloading':
                percent = d.get('_percent_str', '0%').strip()
                speed = d.get('_speed_str', 'N/A').strip()
                eta = d.get('_eta_str', 'N/A').strip()
                
                progress_store[download_id] = {
                    'status': 'downloading',
                    'percent': percent,
                    'speed': speed,
                    'eta': eta,
                    'downloaded': d.get('downloaded_bytes', 0),
                    'total': d.get('total_bytes', 0) or d.get('total_bytes_estimate', 0)
                }
                logger.info(f"Downloading: {percent} - Speed: {speed}")
            elif d['status'] == 'finished':
                progress_store[download_id] = {
                    'status': 'processing',
                    'message': 'Download finished, now processing...'
                }
                logger.info(f"Download finished, now processing...")
        
        # Enhanced yt-dlp config with proper headers and retries for YouTube
        ydl_opts = {
            'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': str(temp_download),
            'quiet': False,
            'no_warnings': False,
            'merge_output_format': 'mp4',
            'progress_hooks': [progress_hook],
            # Enhanced headers to avoid YouTube blocking
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            },
            # Network settings
            'socket_timeout': 30,
            'retries': 10,
            'fragment_retries': 10,
            'extractor_retries': 3,
            # Use cookies if available (helps with YouTube)
            'cookiefile': None,
            # Additional YouTube-specific options
            'youtube_include_dash_manifest': True,
            'youtube_include_hls_manifest': True,
        }
        
        logger.info("Starting yt-dlp download...")
        progress_store[download_id] = {'status': 'starting', 'message': 'Initializing download...'}
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        
        logger.info(f"Download complete. Video title: {info.get('title', 'Unknown')}")
        logger.info(f"Duration: {info.get('duration', 0)} seconds")
        
        # Check if video is already H.264 - if so, skip conversion
        logger.info("Checking video codec...")
        progress_store[download_id] = {'status': 'processing', 'message': 'Checking video codec...'}
        
        probe_cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(temp_download)
        ]
        
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        video_codec = probe_result.stdout.strip()
        logger.info(f"Video codec: {video_codec}")
        
        # If already H.264, just rename the file (no conversion needed)
        if video_codec == 'h264':
            logger.info("Video is already H.264, skipping conversion")
            progress_store[download_id] = {'status': 'processing', 'message': 'Finalizing...'}
            shutil.move(str(temp_download), str(output_file))
        else:
            # Convert to H.264 for Windows compatibility (HEVC/VP9 -> H.264)
            logger.info(f"Converting {video_codec} to H.264 for Windows compatibility...")
            progress_store[download_id] = {'status': 'converting', 'message': f'Converting {video_codec} to H.264...'}
            
            cmd = [
                'ffmpeg', '-i', str(temp_download),
                '-c:v', 'libx264',  # Force H.264 video codec
                '-preset', 'ultrafast',  # Fastest encoding
                '-b:v', '2M',  # Bitrate instead of CRF for better compatibility
                '-c:a', 'copy',  # Copy audio without re-encoding (faster)
                '-movflags', '+faststart',  # Enable streaming
                '-y',  # Overwrite output
                str(output_file)
            ]
            
            logger.info(f"FFmpeg command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg conversion failed!")
                logger.error(f"FFmpeg stderr: {result.stderr}")
                progress_store[download_id] = {'status': 'error', 'message': 'Conversion failed'}
                return
            
            logger.info("Conversion complete")
            
            # Cleanup temp file
            try:
                temp_download.unlink(missing_ok=True)
                logger.info("Temp file cleaned up")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup temp file: {cleanup_error}")
        
        # Mark as complete with result data
        progress_store[download_id] = {
            'status': 'complete',
            'message': 'Download complete!',
            'file_path': str(output_file),
            'filename': output_file.name,
            'platform': platform,
            'title': info.get('title', 'Unknown'),
            'duration': info.get('duration', 0),
            'download_url': f"/api/files/{output_file.name}",
            'codec': video_codec,
            'converted': video_codec != 'h264'
        }
        logger.info(f"=== Video download successful ===")
        
    except Exception as e:
        logger.error(f"=== Video download failed ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.exception("Full traceback:")
        progress_store[download_id] = {'status': 'error', 'message': str(e)}


@app.post("/api/extract/audio")
async def extract_audio(request: ExtractAudioRequest, background_tasks: BackgroundTasks):
    """
    Extract audio from video file
    Returns audio file in MP3 or WAV format
    """
    try:
        video_path = Path(request.video_path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        output_file = generate_filename("extracted_audio", request.format)
        
        # Use ffmpeg to extract audio
        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-vn',  # No video
            '-acodec', 'libmp3lame' if request.format == 'mp3' else 'pcm_s16le',
            '-ar', '44100',  # Sample rate
            '-ac', '2',  # Stereo
            '-y',  # Overwrite
            str(output_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        return {
            "status": "success",
            "file_path": str(output_file),
            "filename": output_file.name,
            "format": request.format,
            "download_url": f"/api/files/{output_file.name}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")


@app.post("/api/extract/audio/upload")
async def extract_audio_from_upload(
    file: UploadFile = File(...),
    format: str = Form("mp3"),
    background_tasks: BackgroundTasks = None
):
    """
    Extract audio from uploaded video file
    Returns audio file in MP3 or WAV format
    """
    try:
        # Validate format
        if format not in ["mp3", "wav"]:
            raise HTTPException(status_code=400, detail="Format must be mp3 or wav")
        
        # Save uploaded file
        video_file = generate_filename("uploaded_video", "mp4")
        with open(video_file, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        logger.info(f"Uploaded video saved: {video_file}")
        
        output_file = generate_filename("extracted_audio", format)
        
        # Use ffmpeg to extract audio
        cmd = [
            'ffmpeg', '-i', str(video_file),
            '-vn',  # No video
            '-acodec', 'libmp3lame' if format == 'mp3' else 'pcm_s16le',
            '-ar', '44100',  # Sample rate
            '-ac', '2',  # Stereo
            '-y',  # Overwrite
            str(output_file)
        ]
        
        logger.info(f"Running ffmpeg: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        # Cleanup uploaded video
        try:
            video_file.unlink(missing_ok=True)
        except:
            pass
        
        logger.info(f"Audio extracted successfully: {output_file}")
        
        return {
            "status": "success",
            "file_path": str(output_file),
            "filename": output_file.name,
            "format": format,
            "download_url": f"/api/files/{output_file.name}"
        }
        
    except Exception as e:
        logger.error(f"Audio extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")


@app.post("/api/convert/audio")
async def convert_audio(request: ConvertAudioRequest, background_tasks: BackgroundTasks):
    """
    Convert audio between MP3 and WAV formats
    """
    try:
        audio_path = Path(request.audio_path)
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        output_file = generate_filename("converted_audio", request.output_format)
        
        # Load and convert using pydub
        audio = AudioSegment.from_file(str(audio_path))
        audio.export(str(output_file), format=request.output_format)
        
        return {
            "status": "success",
            "file_path": str(output_file),
            "filename": output_file.name,
            "format": request.output_format,
            "download_url": f"/api/files/{output_file.name}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio conversion failed: {str(e)}")


@app.post("/api/trim/video")
async def trim_video(request: TrimVideoRequest, background_tasks: BackgroundTasks):
    """
    Trim video to specified time range
    """
    try:
        video_path = Path(request.video_path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        output_file = generate_filename("trimmed_video", "mp4")
        
        cmd = ['ffmpeg', '-i', str(video_path), '-ss', request.start_time]
        
        if request.end_time:
            cmd.extend(['-to', request.end_time])
        elif request.duration:
            cmd.extend(['-t', request.duration])
        
        cmd.extend(['-c', 'copy', str(output_file), '-y'])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        return {
            "status": "success",
            "file_path": str(output_file),
            "filename": output_file.name,
            "download_url": f"/api/files/{output_file.name}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video trimming failed: {str(e)}")


@app.post("/api/adjust/speed")
async def adjust_speed(request: AdjustSpeedRequest, background_tasks: BackgroundTasks):
    """
    Adjust video playback speed
    """
    try:
        video_path = Path(request.video_path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        output_file = generate_filename("speed_adjusted", "mp4")
        
        # Calculate PTS multiplier (inverse of speed)
        pts_multiplier = 1.0 / request.speed
        
        cmd = [
            'ffmpeg', '-i', str(video_path),
            '-filter:v', f'setpts={pts_multiplier}*PTS',
            '-filter:a', f'atempo={request.speed}',
            str(output_file), '-y'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        
        return {
            "status": "success",
            "file_path": str(output_file),
            "filename": output_file.name,
            "speed": request.speed,
            "download_url": f"/api/files/{output_file.name}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speed adjustment failed: {str(e)}")


@app.get("/api/files/{filename}")
async def download_file(filename: str, background_tasks: BackgroundTasks):
    """
    Download generated file
    """
    file_path = TEMP_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Schedule cleanup after 1 hour
    background_tasks.add_task(cleanup_file, str(file_path))
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type='application/octet-stream'
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
