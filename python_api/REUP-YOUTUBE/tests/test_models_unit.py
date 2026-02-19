"""
Unit tests for data models.
"""

import pytest
import json
import tempfile
from datetime import datetime
from pathlib import Path

from src.multilingual_video_pipeline.models import (
    VideoMetadata,
    Transcript,
    TranscriptSegment,
    TranslatedScript,
    Scene,
    OutputFormat,
    JobStatus,
    TranscriptionModel,
    AssetType,
    JobStatusEnum,
    VisualAsset,
    VideoStyle,
    ProcessingMetrics,
)


@pytest.mark.unit
class TestVideoMetadata:
    """Unit tests for VideoMetadata model."""
    
    def test_video_metadata_creation(self, sample_video_metadata):
        """Test VideoMetadata creation with valid data."""
        assert sample_video_metadata.video_id == "test_video_123"
        assert sample_video_metadata.title == "Test Video Title"
        assert sample_video_metadata.duration == 120.5
        assert len(sample_video_metadata.tags) == 3
    
    def test_video_metadata_validation_empty_id(self):
        """Test VideoMetadata validation with empty video ID."""
        with pytest.raises(ValueError, match="Video ID cannot be empty"):
            VideoMetadata(
                video_id="",
                title="Test",
                description="Test",
                duration=120.0,
                upload_date=datetime.now(),
                channel_name="Test",
                channel_url="https://test.com",
                original_language="en",
                tags=[],
            )
    
    def test_video_metadata_validation_negative_duration(self):
        """Test VideoMetadata validation with negative duration."""
        with pytest.raises(ValueError, match="Duration must be positive"):
            VideoMetadata(
                video_id="test",
                title="Test",
                description="Test",
                duration=-10.0,
                upload_date=datetime.now(),
                channel_name="Test",
                channel_url="https://test.com",
                original_language="en",
                tags=[],
            )
    
    def test_video_metadata_serialization(self, sample_video_metadata):
        """Test VideoMetadata serialization to dict."""
        data = sample_video_metadata.to_dict()
        
        assert data['video_id'] == sample_video_metadata.video_id
        assert data['title'] == sample_video_metadata.title
        assert data['duration'] == sample_video_metadata.duration
        assert isinstance(data['upload_date'], str)  # Should be ISO format
        assert data['tags'] == sample_video_metadata.tags
    
    def test_video_metadata_deserialization(self, sample_video_metadata):
        """Test VideoMetadata deserialization from dict."""
        data = sample_video_metadata.to_dict()
        restored = VideoMetadata.from_dict(data)
        
        assert restored.video_id == sample_video_metadata.video_id
        assert restored.title == sample_video_metadata.title
        assert restored.duration == sample_video_metadata.duration
        assert restored.upload_date == sample_video_metadata.upload_date
        assert restored.tags == sample_video_metadata.tags
    
    def test_video_metadata_file_operations(self, sample_video_metadata, tmp_path):
        """Test VideoMetadata file save/load operations."""
        file_path = tmp_path / "metadata.json"
        
        # Save to file
        sample_video_metadata.save_to_file(file_path)
        assert file_path.exists()
        
        # Load from file
        loaded = VideoMetadata.load_from_file(file_path)
        assert loaded.video_id == sample_video_metadata.video_id
        assert loaded.title == sample_video_metadata.title
        assert loaded.duration == sample_video_metadata.duration
    
    def test_video_metadata_file_not_found(self, tmp_path):
        """Test VideoMetadata loading from non-existent file."""
        file_path = tmp_path / "nonexistent.json"
        
        with pytest.raises(FileNotFoundError):
            VideoMetadata.load_from_file(file_path)


@pytest.mark.unit
class TestTranscriptSegment:
    """Unit tests for TranscriptSegment model."""
    
    def test_transcript_segment_creation(self, sample_transcript_segment):
        """Test TranscriptSegment creation with valid data."""
        assert sample_transcript_segment.text == "This is a sample transcript segment."
        assert sample_transcript_segment.start_time == 10.0
        assert sample_transcript_segment.end_time == 15.5
        assert sample_transcript_segment.confidence == 0.95
        assert sample_transcript_segment.duration == 5.5
    
    def test_transcript_segment_validation_negative_start(self):
        """Test TranscriptSegment validation with negative start time."""
        with pytest.raises(ValueError, match="Start time cannot be negative"):
            TranscriptSegment(
                text="Test",
                start_time=-1.0,
                end_time=5.0,
                confidence=0.9,
            )
    
    def test_transcript_segment_validation_invalid_timing(self):
        """Test TranscriptSegment validation with invalid timing."""
        with pytest.raises(ValueError, match="End time must be greater than start time"):
            TranscriptSegment(
                text="Test",
                start_time=10.0,
                end_time=5.0,
                confidence=0.9,
            )
    
    def test_transcript_segment_validation_invalid_confidence(self):
        """Test TranscriptSegment validation with invalid confidence."""
        with pytest.raises(ValueError, match="Confidence must be between 0 and 1"):
            TranscriptSegment(
                text="Test",
                start_time=0.0,
                end_time=5.0,
                confidence=1.5,
            )
    
    def test_transcript_segment_validation_empty_text(self):
        """Test TranscriptSegment validation with empty text."""
        with pytest.raises(ValueError, match="Text cannot be empty"):
            TranscriptSegment(
                text="   ",
                start_time=0.0,
                end_time=5.0,
                confidence=0.9,
            )
    
    def test_transcript_segment_overlaps_with(self):
        """Test TranscriptSegment overlap detection."""
        seg1 = TranscriptSegment("Text 1", 0.0, 5.0, 0.9)
        seg2 = TranscriptSegment("Text 2", 3.0, 8.0, 0.9)  # Overlaps
        seg3 = TranscriptSegment("Text 3", 6.0, 10.0, 0.9)  # No overlap
        
        assert seg1.overlaps_with(seg2)
        assert seg2.overlaps_with(seg1)
        assert not seg1.overlaps_with(seg3)
        assert not seg3.overlaps_with(seg1)
    
    def test_transcript_segment_serialization(self, sample_transcript_segment):
        """Test TranscriptSegment serialization."""
        data = sample_transcript_segment.to_dict()
        restored = TranscriptSegment.from_dict(data)
        
        assert restored.text == sample_transcript_segment.text
        assert restored.start_time == sample_transcript_segment.start_time
        assert restored.end_time == sample_transcript_segment.end_time
        assert restored.confidence == sample_transcript_segment.confidence


@pytest.mark.unit
class TestTranscript:
    """Unit tests for Transcript model."""
    
    def test_transcript_creation(self, sample_transcript):
        """Test Transcript creation with valid data."""
        assert len(sample_transcript.segments) == 1
        assert sample_transcript.language == "en"
        assert sample_transcript.transcription_model == TranscriptionModel.WHISPER_MULTILINGUAL
        assert sample_transcript.model_confidence == 0.95
    
    def test_transcript_validation_empty_segments(self):
        """Test Transcript validation with empty segments."""
        with pytest.raises(ValueError, match="Transcript must have at least one segment"):
            Transcript(
                segments=[],
                language="en",
                full_text="",
                transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
                model_confidence=0.9,
            )
    
    def test_transcript_validation_invalid_confidence(self):
        """Test Transcript validation with invalid model confidence."""
        segment = TranscriptSegment("Test", 0.0, 5.0, 0.9)
        
        with pytest.raises(ValueError, match="Model confidence must be between 0 and 1"):
            Transcript(
                segments=[segment],
                language="en",
                full_text="Test",
                transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
                model_confidence=1.5,
            )
    
    def test_transcript_properties(self, sample_transcript):
        """Test Transcript computed properties."""
        assert sample_transcript.duration == 5.5  # 15.5 - 10.0
        assert sample_transcript.word_count == 6  # "This is a sample transcript segment."
        assert sample_transcript.average_confidence == 0.95
    
    def test_transcript_get_text_at_time(self, sample_transcript):
        """Test Transcript text retrieval at specific time."""
        # Within segment
        text = sample_transcript.get_text_at_time(12.0)
        assert text == "This is a sample transcript segment."
        
        # Outside segment
        text = sample_transcript.get_text_at_time(20.0)
        assert text is None
    
    def test_transcript_serialization(self, sample_transcript):
        """Test Transcript serialization."""
        data = sample_transcript.to_dict()
        restored = Transcript.from_dict(data)
        
        assert len(restored.segments) == len(sample_transcript.segments)
        assert restored.language == sample_transcript.language
        assert restored.full_text == sample_transcript.full_text
        assert restored.transcription_model == sample_transcript.transcription_model
        assert restored.model_confidence == sample_transcript.model_confidence
    
    def test_transcript_file_operations(self, sample_transcript, tmp_path):
        """Test Transcript file save/load operations."""
        file_path = tmp_path / "transcript.json"
        
        # Save to file
        sample_transcript.save_to_file(file_path)
        assert file_path.exists()
        
        # Load from file
        loaded = Transcript.load_from_file(file_path)
        assert loaded.language == sample_transcript.language
        assert len(loaded.segments) == len(sample_transcript.segments)


@pytest.mark.unit
class TestTranslatedScript:
    """Unit tests for TranslatedScript model."""
    
    def test_translated_script_creation(self, sample_translated_script):
        """Test TranslatedScript creation with valid data."""
        assert sample_translated_script.target_language == "vi"
        assert sample_translated_script.duration_ratio == 1.09
        assert len(sample_translated_script.translated_segments) == 1
    
    def test_translated_script_validation_empty_segments(self, sample_transcript):
        """Test TranslatedScript validation with empty segments."""
        with pytest.raises(ValueError, match="Translated script must have at least one segment"):
            TranslatedScript(
                original=sample_transcript,
                translated_segments=[],
                target_language="vi",
                duration_ratio=1.0,
            )
    
    def test_translated_script_validation_segment_count_mismatch(self, sample_transcript):
        """Test TranslatedScript validation with mismatched segment count."""
        # Create extra segment
        extra_segment = TranscriptSegment("Extra", 20.0, 25.0, 0.9)
        
        with pytest.raises(ValueError, match="Number of translated segments must match original"):
            TranslatedScript(
                original=sample_transcript,
                translated_segments=[extra_segment, extra_segment],
                target_language="vi",
                duration_ratio=1.0,
            )
    
    def test_translated_script_properties(self, sample_translated_script):
        """Test TranslatedScript computed properties."""
        assert sample_translated_script.full_translated_text == "Đây là một đoạn transcript mẫu."
        assert sample_translated_script.translation_quality_score == 0.90
        assert sample_translated_script.is_duration_acceptable  # 1.09 is within 0.8-1.2
    
    def test_translated_script_duration_not_acceptable(self, sample_transcript):
        """Test TranslatedScript with unacceptable duration ratio."""
        translated_segment = TranscriptSegment("Very long translation text", 10.0, 30.0, 0.9)
        
        script = TranslatedScript(
            original=sample_transcript,
            translated_segments=[translated_segment],
            target_language="vi",
            duration_ratio=2.5,  # Too high
        )
        
        assert not script.is_duration_acceptable


@pytest.mark.unit
class TestVisualAsset:
    """Unit tests for VisualAsset model."""
    
    def test_visual_asset_creation(self):
        """Test VisualAsset creation with valid data."""
        asset = VisualAsset(
            asset_id="test_asset",
            asset_type=AssetType.STATIC_IMAGE,
            file_path=Path("test.jpg"),
            source_url="https://example.com/image.jpg",
            width=1920,
            height=1080,
            duration=None,
            tags=["test", "image"],
        )
        
        assert asset.asset_id == "test_asset"
        assert asset.asset_type == AssetType.STATIC_IMAGE
        assert asset.width == 1920
        assert asset.height == 1080
        assert asset.aspect_ratio == 1920 / 1080
        assert asset.is_horizontal
        assert not asset.is_vertical
    
    def test_visual_asset_validation_negative_dimensions(self):
        """Test VisualAsset validation with negative dimensions."""
        with pytest.raises(ValueError, match="Width and height must be positive"):
            VisualAsset(
                asset_id="test",
                asset_type=AssetType.STATIC_IMAGE,
                file_path=Path("test.jpg"),
                source_url=None,
                width=-100,
                height=100,
                duration=None,
                tags=[],
            )
    
    def test_visual_asset_validation_animated_without_duration(self):
        """Test VisualAsset validation for animated asset without duration."""
        with pytest.raises(ValueError, match="Duration required for animated assets"):
            VisualAsset(
                asset_id="test",
                asset_type=AssetType.ANIMATED_GIF,
                file_path=Path("test.gif"),
                source_url=None,
                width=100,
                height=100,
                duration=None,  # Missing duration for animated asset
                tags=[],
            )
    
    def test_visual_asset_vertical_format(self):
        """Test VisualAsset with vertical format."""
        asset = VisualAsset(
            asset_id="vertical",
            asset_type=AssetType.STATIC_IMAGE,
            file_path=Path("vertical.jpg"),
            source_url=None,
            width=1080,
            height=1920,
            duration=None,
            tags=[],
        )
        
        assert asset.is_vertical
        assert not asset.is_horizontal
        assert asset.aspect_ratio == 1080 / 1920


@pytest.mark.unit
class TestOutputFormat:
    """Unit tests for OutputFormat model."""
    
    def test_output_format_creation(self, sample_output_format):
        """Test OutputFormat creation with valid data."""
        assert sample_output_format.language == "vi"
        assert sample_output_format.aspect_ratio == "16:9"
        assert sample_output_format.resolution == (1920, 1080)
        assert sample_output_format.platform == "youtube"
        assert sample_output_format.width == 1920
        assert sample_output_format.height == 1080
        assert sample_output_format.is_horizontal
        assert not sample_output_format.is_vertical
    
    def test_output_format_validation_invalid_aspect_ratio(self):
        """Test OutputFormat validation with invalid aspect ratio."""
        with pytest.raises(ValueError, match="Aspect ratio must be"):
            OutputFormat(
                language="en",
                aspect_ratio="4:3",  # Invalid
                resolution=(1920, 1080),
                platform="youtube",
            )
    
    def test_output_format_validation_invalid_platform(self):
        """Test OutputFormat validation with invalid platform."""
        with pytest.raises(ValueError, match="Platform must be"):
            OutputFormat(
                language="en",
                aspect_ratio="16:9",
                resolution=(1920, 1080),
                platform="instagram",  # Invalid
            )
    
    def test_output_format_vertical(self):
        """Test OutputFormat with vertical aspect ratio."""
        format = OutputFormat(
            language="vi",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="tiktok",
        )
        
        assert format.is_vertical
        assert not format.is_horizontal


@pytest.mark.unit
class TestJobStatus:
    """Unit tests for JobStatus model."""
    
    def test_job_status_creation(self, sample_job_status):
        """Test JobStatus creation with valid data."""
        assert sample_job_status.job_id == "job_123"
        assert sample_job_status.video_id == "test_video_123"
        assert sample_job_status.status == JobStatusEnum.PROCESSING
        assert sample_job_status.progress == 0.3
        assert sample_job_status.retry_count == 0
        assert sample_job_status.is_processing
        assert not sample_job_status.is_completed
        assert not sample_job_status.is_failed
    
    def test_job_status_validation_invalid_progress(self):
        """Test JobStatus validation with invalid progress."""
        with pytest.raises(ValueError, match="Progress must be between 0 and 1"):
            JobStatus(
                job_id="test",
                video_id="test",
                status=JobStatusEnum.PROCESSING,
                current_stage="test",
                progress=1.5,  # Invalid
                error_message=None,
                retry_count=0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
    
    def test_job_status_update_progress(self, sample_job_status):
        """Test JobStatus progress update."""
        original_updated = sample_job_status.updated_at
        
        # Update progress
        sample_job_status.update_progress("translation", 0.7)
        
        assert sample_job_status.current_stage == "translation"
        assert sample_job_status.progress == 0.7
        assert sample_job_status.status == JobStatusEnum.PROCESSING
        assert sample_job_status.updated_at > original_updated
    
    def test_job_status_complete(self, sample_job_status):
        """Test JobStatus completion."""
        sample_job_status.update_progress("completed", 1.0)
        
        assert sample_job_status.progress == 1.0
        assert sample_job_status.status == JobStatusEnum.COMPLETED
        assert sample_job_status.is_completed
    
    def test_job_status_error(self, sample_job_status):
        """Test JobStatus error handling."""
        sample_job_status.update_progress("failed", 0.5, "Test error")
        
        assert sample_job_status.error_message == "Test error"
        assert sample_job_status.status == JobStatusEnum.FAILED
        assert sample_job_status.is_failed
    
    def test_job_status_file_operations(self, sample_job_status, tmp_path):
        """Test JobStatus file save/load operations."""
        file_path = tmp_path / "job_status.json"
        
        # Save to file
        sample_job_status.save_to_file(file_path)
        assert file_path.exists()
        
        # Load from file
        loaded = JobStatus.load_from_file(file_path)
        assert loaded.job_id == sample_job_status.job_id
        assert loaded.status == sample_job_status.status
        assert loaded.progress == sample_job_status.progress


@pytest.mark.unit
class TestVideoStyle:
    """Unit tests for VideoStyle model."""
    
    def test_video_style_creation(self):
        """Test VideoStyle creation with valid data."""
        style = VideoStyle(
            animation_speed="medium",
            color_palette=["#FF0000", "#00FF00", "#0000FF"],
            movement_type="smooth",
            transition_style="fade",
        )
        
        assert style.animation_speed == "medium"
        assert len(style.color_palette) == 3
        assert style.movement_type == "smooth"
        assert style.transition_style == "fade"
    
    def test_video_style_serialization(self):
        """Test VideoStyle serialization."""
        style = VideoStyle(
            animation_speed="fast",
            color_palette=["#FFFFFF"],
            movement_type="dynamic",
            transition_style="slide",
        )
        
        data = style.to_dict()
        restored = VideoStyle.from_dict(data)
        
        assert restored.animation_speed == style.animation_speed
        assert restored.color_palette == style.color_palette
        assert restored.movement_type == style.movement_type
        assert restored.transition_style == style.transition_style


@pytest.mark.unit
class TestProcessingMetrics:
    """Unit tests for ProcessingMetrics model."""
    
    def test_processing_metrics_creation(self):
        """Test ProcessingMetrics creation with valid data."""
        start_time = datetime.now()
        
        metrics = ProcessingMetrics(
            stage_name="transcription",
            start_time=start_time,
            end_time=None,
            input_size=1024000,  # 1MB
            output_size=None,
            memory_usage=None,
            cpu_usage=None,
        )
        
        assert metrics.stage_name == "transcription"
        assert metrics.start_time == start_time
        assert metrics.input_size == 1024000
        assert metrics.duration is None  # No end time yet
        assert metrics.throughput is None  # No duration yet
    
    def test_processing_metrics_with_completion(self):
        """Test ProcessingMetrics with completion data."""
        from datetime import timedelta
        start_time = datetime.now()
        end_time = start_time + timedelta(seconds=10)  # 10 seconds later
        
        metrics = ProcessingMetrics(
            stage_name="rendering",
            start_time=start_time,
            end_time=end_time,
            input_size=5120000,  # 5MB
            output_size=2560000,  # 2.5MB
            memory_usage=512.0,  # 512MB
            cpu_usage=75.5,  # 75.5%
        )
        
        assert metrics.duration == 10.0
        assert metrics.throughput == 512000.0  # 5MB / 10s = 512KB/s
        assert metrics.memory_usage == 512.0
        assert metrics.cpu_usage == 75.5