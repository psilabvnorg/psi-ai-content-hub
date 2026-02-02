# AI Content Hub - Python FastAPI Backend

A high-performance FastAPI backend providing video/audio processing tools and TTS capabilities.

## 🚀 Features

### Video Tools
- ✅ Download videos from TikTok, YouTube, Facebook, Instagram
- ✅ Trim videos to specific time ranges
- ✅ Adjust video playback speed (0.5x - 2.0x)

### Audio Tools
- ✅ Extract audio from videos (MP3/WAV)
- ✅ Convert audio formats (MP3 ↔ WAV)

### TTS (Text-to-Speech)
- 🔄 VieNeu TTS integration (coming soon)
- 🔄 Voice cloning capabilities (coming soon)

## 📋 Prerequisites

### Required Software

1. **Python 3.9 or higher**
   ```bash
   python --version  # Should be 3.9+
   ```

2. **FFmpeg** (for video/audio processing)
   
   **Windows:**
   - Download from https://ffmpeg.org/download.html
   - Add to system PATH
   
   **Ubuntu/Debian:**
   ```bash
   sudo apt update
   sudo apt install ffmpeg
   ```
   
   **macOS:**
   ```bash
   brew install ffmpeg
   ```

3. **Verify FFmpeg installation:**
   ```bash
   ffmpeg -version
   ```

## 🛠️ Installation

### 1. Navigate to the API directory
```bash
cd python-api
```

### 2. Create a virtual environment (recommended)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

## 🎯 Quick Start

### Option 1: Using startup scripts

**Windows:**
```bash
start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual start

```bash
python main.py
```

Or with uvicorn:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 📚 API Documentation

### Health Check
```http
GET /api/health
```

### Download Video
```http
POST /api/download/video
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "platform": "youtube"
}
```

**Supported platforms:** `youtube`, `tiktok`, `facebook`, `instagram`

**Response:**
```json
{
  "status": "success",
  "file_path": "/tmp/ai_content_hub/youtube_video_1234567890.mp4",
  "filename": "youtube_video_1234567890.mp4",
  "platform": "youtube",
  "title": "Video Title",
  "duration": 180,
  "download_url": "/api/files/youtube_video_1234567890.mp4"
}
```

### Extract Audio from Video
```http
POST /api/extract/audio
Content-Type: application/json

{
  "video_path": "/path/to/video.mp4",
  "format": "mp3"
}
```

**Formats:** `mp3`, `wav`

### Convert Audio Format
```http
POST /api/convert/audio
Content-Type: application/json

{
  "audio_path": "/path/to/audio.mp3",
  "output_format": "wav"
}
```

### Trim Video
```http
POST /api/trim/video
Content-Type: application/json

{
  "video_path": "/path/to/video.mp4",
  "start_time": "00:00:30",
  "end_time": "00:02:15"
}
```

**Time formats:** `HH:MM:SS` or seconds (e.g., `"30"`)

### Adjust Video Speed
```http
POST /api/adjust/speed
Content-Type: application/json

{
  "video_path": "/path/to/video.mp4",
  "speed": 1.5
}
```

**Speed range:** 0.5 - 2.0

### Download File
```http
GET /api/files/{filename}
```

## 🧪 Testing

### Using curl

**Download a YouTube video:**
```bash
curl -X POST "http://localhost:8000/api/download/video" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","platform":"youtube"}'
```

**Extract audio:**
```bash
curl -X POST "http://localhost:8000/api/extract/audio" \
  -H "Content-Type: application/json" \
  -d '{"video_path":"/tmp/video.mp4","format":"mp3"}'
```

### Using the Interactive Docs

1. Open http://localhost:8000/docs
2. Click on any endpoint
3. Click "Try it out"
4. Fill in the parameters
5. Click "Execute"

## 🔧 Configuration

### Change Port

Edit `main.py`:
```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)  # Change port here
```

### CORS Settings

The API allows all origins by default. To restrict, edit `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],  # Specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Temp Directory

Files are stored in the system temp directory. To change, edit `main.py`:
```python
TEMP_DIR = Path("/your/custom/path")
```

## 🐛 Troubleshooting

### FFmpeg not found
```
Error: ffmpeg not found
```
**Solution:** Install FFmpeg and ensure it's in your system PATH.

### Port already in use
```
Error: [Errno 48] Address already in use
```
**Solution:** Change the port in `main.py` or kill the process using port 8000.

### yt-dlp download errors
```
Error: Unable to download video
```
**Solution:** Update yt-dlp:
```bash
pip install --upgrade yt-dlp
```

### Module not found
```
ModuleNotFoundError: No module named 'fastapi'
```
**Solution:** Install dependencies:
```bash
pip install -r requirements.txt
```

## 📦 Dependencies

- **fastapi** - Modern web framework
- **uvicorn** - ASGI server
- **yt-dlp** - Video downloader
- **pydub** - Audio processing
- **python-multipart** - File upload support

## 🚀 Production Deployment

### Using Gunicorn

```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Using Docker

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t ai-content-hub-api .
docker run -p 8000:8000 ai-content-hub-api
```

## 📝 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues or questions, please open an issue on GitHub.
