"""
Pytest configuration and fixtures for the multilingual video pipeline tests.
"""

import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, MagicMock
from typing import Generator

from src.multilingual_video_pipeline.config import Settings
from src.multilingual_video_pipeline.models import (
    VideoMetadata, 
    Transcript, 
    TranscriptSegment,
    TranslatedScript,
    Scene,
    OutputFormat,
    JobStatus,
    TranscriptionModel,
)


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for tests."""
    temp_path = Path(tempfile.mkdtemp())
    try:
        yield temp_path
    finally:
        shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def test_settings(temp_dir: Path) -> Settings:
    """Create test settings with temporary directories."""
    settings = Settings(
        data_dir=temp_dir / "data",
        output_dir=temp_dir / "output", 
        cache_dir=temp_dir / "cache",
        logs_dir=temp_dir / "logs",
        max_concurrent_jobs=2,
        log_level="DEBUG",
    )
    
    # Create directories
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    settings.logs_dir.mkdir(parents=True, exist_ok=True)
    
    return settings


@pytest.fixture
def sample_video_metadata() -> VideoMetadata:
    """Create sample video metadata for testing."""
    from datetime import datetime
    
    return VideoMetadata(
        video_id="test_video_123",
        title="Test Video Title",
        description="This is a test video description",
        duration=120.5,
        upload_date=datetime(2024, 1, 15, 10, 30, 0),
        channel_name="Test Channel",
        channel_url="https://www.youtube.com/@testchannel",
        original_language="en",
        tags=["test", "video", "sample"],
    )


@pytest.fixture
def sample_transcript_segment() -> TranscriptSegment:
    """Create sample transcript segment for testing."""
    return TranscriptSegment(
        text="This is a sample transcript segment.",
        start_time=10.0,
        end_time=15.5,
        confidence=0.95,
    )


@pytest.fixture
def sample_transcript(sample_transcript_segment: TranscriptSegment) -> Transcript:
    """Create sample transcript for testing."""
    return Transcript(
        segments=[sample_transcript_segment],
        language="en",
        full_text="This is a sample transcript segment.",
        transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
        model_confidence=0.95,
    )


@pytest.fixture
def sample_translated_script(sample_transcript: Transcript) -> TranslatedScript:
    """Create sample translated script for testing."""
    translated_segment = TranscriptSegment(
        text="Đây là một đoạn transcript mẫu.",
        start_time=10.0,
        end_time=16.0,
        confidence=0.90,
    )
    
    return TranslatedScript(
        original=sample_transcript,
        translated_segments=[translated_segment],
        target_language="vi",
        duration_ratio=1.09,  # Slightly longer in Vietnamese
    )


@pytest.fixture
def sample_output_format() -> OutputFormat:
    """Create sample output format for testing."""
    return OutputFormat(
        language="vi",
        aspect_ratio="16:9",
        resolution=(1920, 1080),
        platform="youtube",
    )


@pytest.fixture
def sample_job_status() -> JobStatus:
    """Create sample job status for testing."""
    from datetime import datetime
    from src.multilingual_video_pipeline.models import JobStatusEnum
    
    return JobStatus(
        job_id="job_123",
        video_id="test_video_123",
        status=JobStatusEnum.PROCESSING,
        current_stage="transcription",
        progress=0.3,
        error_message=None,
        retry_count=0,
        created_at=datetime(2024, 1, 15, 10, 30, 0),
        updated_at=datetime(2024, 1, 15, 10, 35, 0),
    )


@pytest.fixture
def mock_video_file(temp_dir: Path) -> Path:
    """Create a mock video file for testing."""
    video_file = temp_dir / "test_video.mp4"
    video_file.write_bytes(b"fake video content")
    return video_file


@pytest.fixture
def mock_audio_file(temp_dir: Path) -> Path:
    """Create a mock audio file for testing."""
    audio_file = temp_dir / "test_audio.wav"
    audio_file.write_bytes(b"fake audio content")
    return audio_file


@pytest.fixture
def mock_image_file(temp_dir: Path) -> Path:
    """Create a mock image file for testing."""
    image_file = temp_dir / "test_image.jpg"
    image_file.write_bytes(b"fake image content")
    return image_file


# Property-based testing fixtures
@pytest.fixture
def hypothesis_settings():
    """Configure Hypothesis settings for property tests."""
    from hypothesis import settings, Verbosity
    
    return settings(
        max_examples=100,
        verbosity=Verbosity.verbose,
        deadline=None,  # No deadline for slow operations
    )