# Multilingual Video Pipeline

An automated system for transforming YouTube videos into multilingual versions with replaced visuals and emotional female narration.

## Features

- **Multi-language Support**: Vietnamese, Japanese, German, and English
- **Intelligent Transcription**: PhoWhisper for Vietnamese, OpenAI Whisper for other languages
- **Visual Replacement**: Automated sourcing and replacement of video visuals
- **Emotional TTS**: F5-TTS for natural, expressive narration
- **Platform Optimization**: Export formats for YouTube, TikTok, and Facebook
- **Batch Processing**: Concurrent processing of multiple videos

## Installation

### Prerequisites

- Python 3.9 or higher
- FFmpeg installed and available in PATH
- Redis server (optional, for job queue)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd multilingual-video-pipeline
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -e .
```

4. Install development dependencies (optional):
```bash
pip install -e ".[dev]"
```

5. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Quick Start

### Basic Usage

```python
from multilingual_video_pipeline import VideoIngestionService, JobOrchestrator

# Initialize services
ingestion = VideoIngestionService()
orchestrator = JobOrchestrator()

# Process a video
video_url = "https://www.youtube.com/watch?v=VIDEO_ID"
job_id = orchestrator.submit_job(video_url)

# Check status
status = orchestrator.get_job_status(job_id)
print(f"Job status: {status.status}")
```

### Command Line Interface

```bash
# Process a single video
mvp-pipeline process --url "https://www.youtube.com/watch?v=VIDEO_ID"

# Process multiple videos from a channel
mvp-pipeline process --channel "https://www.youtube.com/@channel" --limit 5

# Check job status
mvp-pipeline status --job-id JOB_ID

# List all jobs
mvp-pipeline list-jobs
```

## Configuration

The pipeline can be configured through environment variables or the `.env` file:

- `MAX_CONCURRENT_JOBS`: Number of concurrent processing jobs (default: 5)
- `WHISPER_MODEL`: Whisper model size (default: "base")
- `PHOWHISPER_MODEL`: PhoWhisper model size (default: "base")
- `TARGET_LUFS`: Audio loudness target (default: -16.0)
- `LOG_LEVEL`: Logging level (default: "INFO")

See `.env.example` for all available options.

## Architecture

The pipeline consists of modular services:

1. **Video Ingestion Service**: Downloads and extracts metadata
2. **Transcription Service**: Converts audio to text (PhoWhisper + Whisper)
3. **Translation Service**: Translates scripts to target languages
4. **Visual Asset Manager**: Sources and prepares replacement images/animations
5. **TTS Service**: Generates emotional female narration (F5-TTS)
6. **Scene Assembler**: Aligns visuals with narration timing
7. **Subtitle Generator**: Creates time-synchronized subtitles
8. **Video Renderer**: Renders final videos in multiple formats
9. **Export Manager**: Optimizes for different platforms

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run unit tests only
pytest -m unit

# Run property tests
pytest -m property

# Run with coverage
pytest --cov=src/multilingual_video_pipeline
```

### Code Quality

```bash
# Format code
black src/ tests/

# Lint code
flake8 src/ tests/

# Type checking
mypy src/
```

## Supported Platforms

### Input Sources
- YouTube channels and individual videos

### Output Formats
- **Horizontal (16:9)**: All languages, optimized for YouTube
- **Vertical (9:16)**: Vietnamese only, optimized for TikTok/Facebook Reels

### Languages
- Vietnamese (vi) - Uses PhoWhisper for transcription
- Japanese (ja)
- German (de)
- English (en)

## License

[License information here]

## Contributing

[Contributing guidelines here]

## Support

[Support information here]