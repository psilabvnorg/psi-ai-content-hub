# Audio Transcription FastAPI

Simple FastAPI service for transcribing WAV audio files to text.

## Features

- **Input**: WAV audio files
- **Output**: Transcribed text with metadata
- Vietnamese language support (PhoWhisper)
- Optional punctuation restoration
- RESTful API with automatic documentation

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Start the API Server

```bash
chmod +x start.sh
./start.sh
```

The API will be available at `http://localhost:8001`

### API Endpoints

#### 1. Health Check
```bash
curl http://localhost:8001/health
```

#### 2. Transcribe Audio
```bash
curl -X POST http://localhost:8001/transcribe \
  -F "file=@/path/to/audio.wav" \
  -F "language=vi" \
  -F "add_punctuation=true"
```

### Interactive API Documentation

Visit `http://localhost:8001/docs` for interactive Swagger UI documentation.

## Test the API

```bash
chmod +x test_api.sh
./test_api.sh /path/to/your/audio.wav
```

## API Response Format

```json
{
  "success": true,
  "filename": "audio.wav",
  "text": "Transcribed text with punctuation.",
  "text_no_punctuation": "transcribed text without punctuation",
  "language": "vi",
  "duration": 15.5,
  "segments_count": 3,
  "punctuation_restored": true
}
```

## Configuration

Edit `MODEL_PATH` in `main.py` to point to your PhoWhisper model location:

```python
MODEL_PATH = "/path/to/your/model"
```

## Requirements

- FastAPI
- Uvicorn
- Transformers (for PhoWhisper)
- Python 3.8+

## Notes

- Only WAV files are supported
- Default language is Vietnamese ("vi")
- Punctuation restoration is enabled by default
