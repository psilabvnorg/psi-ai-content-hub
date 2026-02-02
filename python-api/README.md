# AI Content Hub - Python FastAPI Backend

Fast API backend for video/audio tools and TTS integration.

## Features

- Download videos from TikTok, YouTube, Facebook, Instagram
- Extract audio from videos (MP3/WAV)
- Convert audio formats (MP3 ↔ WAV)
- Trim videos
- Adjust video speed
- VieNeu TTS integration (super fast Vietnamese TTS)

## Installation

### Prerequisites

1. **Python 3.9+**
2. **FFmpeg** - Required for video/audio processing
   ```bash
   # Windows (using chocolatey)
   choco install ffmpeg
   
   # Ubuntu/Debian
   sudo apt install ffmpeg
   
   # macOS
   brew install ffmpeg
   ```

### Setup

1. Install Python dependencies:
   ```bash
   cd python-api
   pip install -r requirements.txt
   ```

2. Run the API server:
   ```bash
   python main.py
   ```

   Or with uvicorn:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Endpoints

### Health Check
```
GET /api/health
```

### Download Video
```
POST /api/download/video
Body: {
  "url": "https://...",
  "platform": "youtube" | "tiktok" | "facebook" | "instagram"
}
```

### Extract Audio from Video
```
POST /api/extract/audio
Body: {
  "video_path": "/path/to/video.mp4",
  "format": "mp3" | "wav"
}
```

### Convert Audio Format
```
POST /api/convert/audio
Body: {
  "audio_path": "/path/to/audio.mp3",
  "output_format": "wav" | "mp3"
}
```

### Trim Video
```
POST /api/trim/video
Body: {
  "video_path": "/path/to/video.mp4",
  "start_time": "00:00:30",
  "end_time": "00:02:15"
}
```

### Adjust Video Speed
```
POST /api/adjust/speed
Body: {
  "video_path": "/path/to/video.mp4",
  "speed": 1.5
}
```

### Download File
```
GET /api/files/{filename}
```

## Integration with Frontend

The API runs on `http://localhost:8000` by default. Update your frontend to point to this URL.

## Troubleshooting

### 403 Forbidden Errors

If you get 403 errors when downloading videos:

1. **Update yt-dlp** (platforms change their APIs frequently):
   ```bash
   pip install --upgrade yt-dlp
   ```

2. **Check if the video is accessible** - Try opening the URL in your browser

3. **Platform-specific issues**:
   - YouTube: Some videos may be region-locked or age-restricted
   - TikTok: Private videos or accounts won't work
   - Instagram: Login may be required for some content

4. **Use cookies** (for authenticated content):
   - Export cookies from your browser using a browser extension
   - Place cookies.txt in the python-api folder
   - The API will automatically use them

### Other Common Issues

- **FFmpeg not found**: Make sure FFmpeg is installed and in your PATH
- **Slow downloads**: This is normal for large videos, check the console logs for progress
- **Out of disk space**: Temp files are stored in your system's temp directory

## Development

API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
