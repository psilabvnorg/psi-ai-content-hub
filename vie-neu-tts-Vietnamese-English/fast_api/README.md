# VieNeu-TTS FastAPI Web Application

This is a FastAPI-based web interface for VieNeu-TTS with bilingual support (Vietnamese/English).

## Features

- 🌐 **Bilingual Interface**: Seamless switching between Vietnamese and English
- 🎤 **10 Voice Options**: Multiple voice profiles from different regions (North/South Vietnam)
- 📝 **Text Input**: Up to 500 characters with real-time character counter
- 🎵 **Audio Generation**: Text-to-speech with instant voice cloning
- 💾 **Persistent Settings**: Saves language preference, selected voice, and last text
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices
- 🎨 **Modern UI**: Clean and intuitive interface with smooth animations

## Project Structure

```
fast_api/
├── main.py                    # FastAPI backend with API endpoints
├── requirements.txt           # Python dependencies
├── start.sh                   # Server start script
├── static/
│   ├── css/
│   │   └── style.css         # Application styles
│   ├── js/
│   │   ├── app.js            # Main application logic
│   │   └── translations.js   # Bilingual translations
│   └── audio/
│       └── samples/          # Sample audio files (to be added)
└── templates/
    └── index.html            # Main HTML template
```

## Installation

### Prerequisites

- Python 3.12 or higher
- pip or uv package manager

### Setup

1. Navigate to the fast_api directory:
   ```bash
   cd /home/psilab/VieNeu-TTS/fast_api
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   Or with uv:
   ```bash
   uv pip install -r requirements.txt
   ```

## Running the Application

### Option 1: Using the start script

```bash
./start.sh
```

### Option 2: Direct Python execution

```bash
python main.py
```

### Option 3: Using Uvicorn directly

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The application will be available at: **http://localhost:8000**

## API Endpoints

### GET /
- **Description**: Serves the main web interface
- **Returns**: HTML page

### GET /api/voices
- **Description**: Get list of available voices
- **Query Parameters**: 
  - `language` (optional): `vi` or `en` (default: `vi`)
- **Returns**: JSON array of voice objects

### POST /api/generate
- **Description**: Generate speech from text (placeholder)
- **Request Body**:
  ```json
  {
    "text": "Your text here",
    "voice_id": "voice_id",
    "language": "vi"
  }
  ```
- **Returns**: JSON with audio URL and status

### GET /api/health
- **Description**: Health check endpoint
- **Returns**: Service status

## UI Components

### Language Toggle
- Fixed position in top-right corner
- Toggle between Vietnamese (🇻🇳) and English (🇺🇸)
- Preference saved in localStorage

### Voice Selector
- 10 voice options with visual cards
- Gender icons (👨/👩) based on voice type
- Localized descriptions
- Visual feedback for selected voice

### Text Input
- Maximum 500 characters
- Real-time character counter
- Color-coded warnings (orange at 90%, red at 100%)
- Auto-save to localStorage

### Generate Button
- Disabled when form is invalid
- Loading spinner during generation
- Gradient design with hover effects

### Audio Player
- HTML5 audio controls
- Download button for generated audio
- Auto-play on generation

### Sample Audio Section
- Pre-recorded voice samples
- Demonstrates voice quality and variety

## Configuration

All voice data is currently stored in `main.py`. To add or modify voices, edit the `VOICES` array:

```python
VOICES = [
    {
        "id": "voice_id",
        "name": "Voice Name",
        "description": {"vi": "Mô tả tiếng Việt", "en": "English description"},
        "thumbnail": None
    }
]
```

## Next Steps

To integrate with the actual VieNeu-TTS model:

1. Import VieNeu-TTS modules in `main.py`
2. Implement the `/api/generate` endpoint with actual TTS logic
3. Add sample audio files to `static/audio/samples/`
4. Configure audio output directory
5. Add error handling and validation
6. Implement streaming support (optional)

## Development

### Hot Reload
The server runs with `--reload` flag by default, so any changes to Python files will automatically restart the server.

### Testing
Test the API endpoints:
```bash
# Health check
curl http://localhost:8000/api/health

# Get voices
curl http://localhost:8000/api/voices?language=vi

# Generate speech (placeholder)
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Xin chào", "voice_id": "binh", "language": "vi"}'
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

Apache License 2.0

## Author

Part of the VieNeu-TTS project by Phạm Nguyễn Ngọc Bảo
