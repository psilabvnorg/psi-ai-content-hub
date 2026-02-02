# AI Studio

Video and audio processing tools powered by AI.

## Quick Start

### 1. Install Dependencies

```bash
npm install
python -m venv venv
venv\Scripts\activate
pip install -r python-api/requirements.txt
```

### 2. Run the App

**Backend:**
```bash
cd python-api
python main.py
```

**Frontend:**
```bash
npm run dev
```

### 3. Open Browser

- Frontend: http://localhost:5000
- API Docs: http://localhost:8000/docs

## Features

- Extract audio from video (MP3/WAV)
- Download videos from YouTube, TikTok, Instagram, Facebook
- Trim and adjust video speed
- Convert audio formats

## Requirements

- Node.js
- Python 3.8+
- FFmpeg