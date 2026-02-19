"""
Property-based tests for data model validation.
Feature: multilingual-video-pipeline, Property 1: Complete Metadata Extraction
"""

import pytest
from datetime import datetime, timedelta
from pathlib import Path
from hypothesis import given, strategies as st, assume, settings, HealthCheck
from hypothesis.strategies import composite

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


# Custom strategies for generating test data

@composite
def video_metadata_strategy(draw):
    """Generate valid VideoMetadata instances."""
    video_id = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
    title = draw(st.text(min_size=1, max_size=200))
    description = draw(st.text(max_size=1000))
    duration = draw(st.floats(min_value=0.1, max_value=86400))  # Up to 24 hours
    upload_date = draw(st.datetimes(min_value=datetime(2000, 1, 1), max_value=datetime(2030, 12, 31)))
    channel_name = draw(st.text(min_size=1, max_size=100))
    channel_url = draw(st.text(min_size=10, max_size=200))
    original_language = draw(st.sampled_from(['en', 'vi', 'ja', 'de', 'fr', 'es']))
    tags = draw(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=20))
    
    return VideoMetadata(
        video_id=video_id,
        title=title,
        description=description,
        duration=duration,
        upload_date=upload_date,
        channel_name=channel_name,
        channel_url=channel_url,
        original_language=original_language,
        tags=tags,
    )


@composite
def transcript_segment_strategy(draw):
    """Generate valid TranscriptSegment instances."""
    start_time = draw(st.floats(min_value=0, max_value=3600))
    duration = draw(st.floats(min_value=0.1, max_value=60))
    end_time = start_time + duration
    # Ensure text is not just whitespace
    text = draw(st.text(min_size=1, max_size=500).filter(lambda t: t.strip()))
    confidence = draw(st.floats(min_value=0.0, max_value=1.0))
    
    return TranscriptSegment(
        text=text,
        start_time=start_time,
        end_time=end_time,
        confidence=confidence,
    )


@composite
def transcript_strategy(draw):
    """Generate valid Transcript instances."""
    segments = draw(st.lists(transcript_segment_strategy(), min_size=1, max_size=50))
    
    # Ensure segments are in chronological order
    segments.sort(key=lambda s: s.start_time)
    
    # Adjust segments to avoid overlaps
    for i in range(1, len(segments)):
        if segments[i].start_time < segments[i-1].end_time:
            segments[i] = TranscriptSegment(
                text=segments[i].text,
                start_time=segments[i-1].end_time,
                end_time=segments[i-1].end_time + (segments[i].end_time - segments[i].start_time),
                confidence=segments[i].confidence,
            )
    
    language = draw(st.sampled_from(['en', 'vi', 'ja', 'de']))
    full_text = " ".join(seg.text for seg in segments)
    transcription_model = draw(st.sampled_from(list(TranscriptionModel)))
    model_confidence = draw(st.floats(min_value=0.0, max_value=1.0))
    
    return Transcript(
        segments=segments,
        language=language,
        full_text=full_text,
        transcription_model=transcription_model,
        model_confidence=model_confidence,
    )


@composite
def visual_asset_strategy(draw):
    """Generate valid VisualAsset instances."""
    asset_id = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
    asset_type = draw(st.sampled_from(list(AssetType)))
    file_path = Path(draw(st.text(min_size=5, max_size=100))) / "asset.jpg"
    source_url = draw(st.one_of(st.none(), st.text(min_size=10, max_size=200)))
    width = draw(st.integers(min_value=240, max_value=7680))
    height = draw(st.integers(min_value=240, max_value=7680))
    
    # Duration required for animated assets
    if asset_type in [AssetType.ANIMATED_GIF, AssetType.VIDEO_CLIP]:
        duration = draw(st.floats(min_value=0.1, max_value=60))
    else:
        duration = None
    
    tags = draw(st.lists(st.text(min_size=1, max_size=30), min_size=0, max_size=10))
    
    return VisualAsset(
        asset_id=asset_id,
        asset_type=asset_type,
        file_path=file_path,
        source_url=source_url,
        width=width,
        height=height,
        duration=duration,
        tags=tags,
    )


@composite
def output_format_strategy(draw):
    """Generate valid OutputFormat instances."""
    language = draw(st.sampled_from(['vi', 'ja', 'de', 'en']))
    aspect_ratio = draw(st.sampled_from(['16:9', '9:16']))
    platform = draw(st.sampled_from(['youtube', 'tiktok', 'facebook']))
    
    # Generate appropriate resolution based on aspect ratio
    if aspect_ratio == '16:9':
        width = draw(st.sampled_from([1920, 2560, 3840]))  # Common horizontal resolutions
        height = int(width * 9 / 16)
    else:  # 9:16
        height = draw(st.sampled_from([1920, 2560]))  # Common vertical heights
        width = int(height * 9 / 16)
    
    return OutputFormat(
        language=language,
        aspect_ratio=aspect_ratio,
        resolution=(width, height),
        platform=platform,
    )


@composite
def job_status_strategy(draw):
    """Generate valid JobStatus instances."""
    job_id = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
    video_id = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
    status = draw(st.sampled_from(list(JobStatusEnum)))
    current_stage = draw(st.text(min_size=1, max_size=50))
    progress = draw(st.floats(min_value=0.0, max_value=1.0))
    error_message = draw(st.one_of(st.none(), st.text(max_size=500)))
    retry_count = draw(st.integers(min_value=0, max_value=10))
    
    created_at = draw(st.datetimes(min_value=datetime(2024, 1, 1), max_value=datetime.now()))
    updated_at = draw(st.datetimes(min_value=created_at, max_value=created_at + timedelta(hours=24)))
    
    return JobStatus(
        job_id=job_id,
        video_id=video_id,
        status=status,
        current_stage=current_stage,
        progress=progress,
        error_message=error_message,
        retry_count=retry_count,
        created_at=created_at,
        updated_at=updated_at,
    )


# Property tests

@pytest.mark.property
class TestVideoMetadataProperties:
    """Property tests for VideoMetadata model."""
    
    @given(video_metadata_strategy())
    def test_video_metadata_serialization_roundtrip(self, metadata: VideoMetadata):
        """
        Feature: multilingual-video-pipeline, Property 1: Complete Metadata Extraction
        For any VideoMetadata instance, serializing then deserializing should produce equivalent object.
        """
        # Serialize to dict
        data = metadata.to_dict()
        
        # Deserialize back
        restored = VideoMetadata.from_dict(data)
        
        # Should be equivalent
        assert restored.video_id == metadata.video_id
        assert restored.title == metadata.title
        assert restored.description == metadata.description
        assert restored.duration == metadata.duration
        assert restored.upload_date == metadata.upload_date
        assert restored.channel_name == metadata.channel_name
        assert restored.channel_url == metadata.channel_url
        assert restored.original_language == metadata.original_language
        assert restored.tags == metadata.tags
    
    @given(video_metadata_strategy())
    def test_video_metadata_has_required_fields(self, metadata: VideoMetadata):
        """
        Feature: multilingual-video-pipeline, Property 1: Complete Metadata Extraction
        For any VideoMetadata instance, all required fields should be present and valid.
        """
        # Required fields should not be empty
        assert metadata.video_id
        assert metadata.title
        assert metadata.channel_name
        assert metadata.channel_url
        assert metadata.original_language
        
        # Duration should be positive
        assert metadata.duration > 0
        
        # Upload date should be a datetime
        assert isinstance(metadata.upload_date, datetime)
        
        # Tags should be a list
        assert isinstance(metadata.tags, list)
    
    @settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(metadata=video_metadata_strategy())
    def test_video_metadata_file_operations(self, metadata: VideoMetadata, tmp_path):
        """
        Feature: multilingual-video-pipeline, Property 1: Complete Metadata Extraction
        For any VideoMetadata instance, file save/load operations should preserve data.
        """
        file_path = tmp_path / f"test_metadata_{metadata.video_id}.json"
        
        # Save to file
        metadata.save_to_file(file_path)
        
        # File should exist
        assert file_path.exists()
        
        # Load from file
        loaded = VideoMetadata.load_from_file(file_path)
        
        # Should be equivalent
        assert loaded.video_id == metadata.video_id
        assert loaded.title == metadata.title
        assert loaded.duration == metadata.duration


@pytest.mark.property
class TestTranscriptProperties:
    """Property tests for Transcript model."""
    
    @given(transcript_strategy())
    def test_transcript_segments_chronological(self, transcript: Transcript):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any Transcript, segments should be in chronological order.
        """
        for i in range(1, len(transcript.segments)):
            current_start = transcript.segments[i].start_time
            previous_end = transcript.segments[i-1].end_time
            
            # Current segment should start after or at the end of previous segment
            assert current_start >= previous_end - 0.1  # Allow small tolerance
    
    @given(transcript_strategy())
    def test_transcript_duration_calculation(self, transcript: Transcript):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any Transcript, duration should be calculated correctly.
        """
        if transcript.segments:
            expected_duration = transcript.segments[-1].end_time - transcript.segments[0].start_time
            assert abs(transcript.duration - expected_duration) < 0.001
        else:
            assert transcript.duration == 0.0
    
    @given(transcript_strategy())
    def test_transcript_serialization_roundtrip(self, transcript: Transcript):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any Transcript, serialization should preserve all data.
        """
        data = transcript.to_dict()
        restored = Transcript.from_dict(data)
        
        assert len(restored.segments) == len(transcript.segments)
        assert restored.language == transcript.language
        assert restored.full_text == transcript.full_text
        assert restored.transcription_model == transcript.transcription_model
        assert restored.model_confidence == transcript.model_confidence


@pytest.mark.property
class TestTranscriptSegmentProperties:
    """Property tests for TranscriptSegment model."""
    
    @given(transcript_segment_strategy())
    def test_segment_timing_validity(self, segment: TranscriptSegment):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any TranscriptSegment, timing should be valid.
        """
        assert segment.start_time >= 0
        assert segment.end_time > segment.start_time
        assert segment.duration > 0
        assert segment.duration == segment.end_time - segment.start_time
    
    @given(transcript_segment_strategy())
    def test_segment_confidence_range(self, segment: TranscriptSegment):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any TranscriptSegment, confidence should be in valid range.
        """
        assert 0.0 <= segment.confidence <= 1.0
    
    @given(transcript_segment_strategy())
    def test_segment_text_not_empty(self, segment: TranscriptSegment):
        """
        Feature: multilingual-video-pipeline, Property 3: Transcript Generation Completeness
        For any TranscriptSegment, text should not be empty.
        """
        assert segment.text.strip()


@pytest.mark.property
class TestVisualAssetProperties:
    """Property tests for VisualAsset model."""
    
    @given(visual_asset_strategy())
    def test_visual_asset_dimensions_positive(self, asset: VisualAsset):
        """
        Feature: multilingual-video-pipeline, Property 8: Image Source Validation
        For any VisualAsset, dimensions should be positive.
        """
        assert asset.width > 0
        assert asset.height > 0
        assert asset.aspect_ratio > 0
    
    @given(visual_asset_strategy())
    def test_animated_assets_have_duration(self, asset: VisualAsset):
        """
        Feature: multilingual-video-pipeline, Property 8: Image Source Validation
        For any animated VisualAsset, duration should be specified.
        """
        if asset.asset_type in [AssetType.ANIMATED_GIF, AssetType.VIDEO_CLIP]:
            assert asset.duration is not None
            assert asset.duration > 0
    
    @given(visual_asset_strategy())
    def test_visual_asset_aspect_ratio_calculation(self, asset: VisualAsset):
        """
        Feature: multilingual-video-pipeline, Property 8: Image Source Validation
        For any VisualAsset, aspect ratio should be calculated correctly.
        """
        expected_ratio = asset.width / asset.height
        assert abs(asset.aspect_ratio - expected_ratio) < 0.001
        
        # Test orientation properties
        if asset.aspect_ratio > 1.0:
            assert asset.is_horizontal
            assert not asset.is_vertical
        elif asset.aspect_ratio < 1.0:
            assert asset.is_vertical
            assert not asset.is_horizontal


@pytest.mark.property
class TestOutputFormatProperties:
    """Property tests for OutputFormat model."""
    
    @given(output_format_strategy())
    def test_output_format_aspect_ratio_consistency(self, format: OutputFormat):
        """
        Feature: multilingual-video-pipeline, Property 15: Horizontal Format Consistency
        For any OutputFormat, aspect ratio should match resolution.
        """
        actual_ratio = format.width / format.height
        
        if format.aspect_ratio == "16:9":
            expected_ratio = 16 / 9
            assert abs(actual_ratio - expected_ratio) < 0.01
            assert format.is_horizontal
            assert not format.is_vertical
        elif format.aspect_ratio == "9:16":
            expected_ratio = 9 / 16
            assert abs(actual_ratio - expected_ratio) < 0.01
            assert format.is_vertical
            assert not format.is_horizontal
    
    @given(output_format_strategy())
    def test_output_format_resolution_minimum(self, format: OutputFormat):
        """
        Feature: multilingual-video-pipeline, Property 9: Minimum Resolution Compliance
        For any OutputFormat, resolution should meet minimum requirements.
        """
        assert format.width >= 240
        assert format.height >= 240
        
        # For horizontal formats, should be at least 1080p
        if format.is_horizontal:
            assert format.height >= 1080
    
    @given(output_format_strategy())
    def test_output_format_valid_values(self, format: OutputFormat):
        """
        Feature: multilingual-video-pipeline, Property 14: Language Output Completeness
        For any OutputFormat, all values should be valid.
        """
        assert format.language in ['vi', 'ja', 'de', 'en']
        assert format.aspect_ratio in ['16:9', '9:16']
        assert format.platform in ['youtube', 'tiktok', 'facebook']


@pytest.mark.property
class TestJobStatusProperties:
    """Property tests for JobStatus model."""
    
    @given(job_status_strategy())
    def test_job_status_progress_range(self, status: JobStatus):
        """
        Feature: multilingual-video-pipeline, Property 30: Processing Log Completeness
        For any JobStatus, progress should be in valid range.
        """
        assert 0.0 <= status.progress <= 1.0
    
    @given(job_status_strategy())
    def test_job_status_timing_consistency(self, status: JobStatus):
        """
        Feature: multilingual-video-pipeline, Property 30: Processing Log Completeness
        For any JobStatus, timing should be consistent.
        """
        assert status.updated_at >= status.created_at
        assert status.duration >= 0
    
    @given(job_status_strategy())
    def test_job_status_retry_count_non_negative(self, status: JobStatus):
        """
        Feature: multilingual-video-pipeline, Property 28: Retry Limit Enforcement
        For any JobStatus, retry count should be non-negative.
        """
        assert status.retry_count >= 0
    
    @given(job_status_strategy())
    def test_job_status_serialization_roundtrip(self, status: JobStatus):
        """
        Feature: multilingual-video-pipeline, Property 43: State Persistence and Recovery
        For any JobStatus, serialization should preserve all data.
        """
        data = status.to_dict()
        restored = JobStatus.from_dict(data)
        
        assert restored.job_id == status.job_id
        assert restored.video_id == status.video_id
        assert restored.status == status.status
        assert restored.progress == status.progress
        assert restored.retry_count == status.retry_count
        assert restored.created_at == status.created_at
        assert restored.updated_at == status.updated_at


# Integration property tests

@pytest.mark.property
class TestModelIntegrationProperties:
    """Property tests for model interactions."""
    
    @given(transcript_strategy(), st.sampled_from(['vi', 'ja', 'de', 'en']))
    def test_translated_script_segment_count_matches(self, original: Transcript, target_lang: str):
        """
        Feature: multilingual-video-pipeline, Property 4: Multilingual Translation Coverage
        For any translation, segment count should match original.
        """
        # Create translated segments (simplified for testing)
        # Use proportional duration increase (10% longer) instead of additive
        translated_segments = []
        for seg in original.segments:
            translated_segments.append(TranscriptSegment(
                text=f"Translated: {seg.text}",
                start_time=seg.start_time,
                end_time=seg.start_time + (seg.duration * 1.1),  # 10% longer proportionally
                confidence=seg.confidence * 0.9,  # Slightly lower confidence
            ))
        
        duration_ratio = sum(seg.duration for seg in translated_segments) / sum(seg.duration for seg in original.segments)
        
        translated_script = TranslatedScript(
            original=original,
            translated_segments=translated_segments,
            target_language=target_lang,
            duration_ratio=duration_ratio,
        )
        
        # Segment count should match
        assert len(translated_script.translated_segments) == len(original.segments)
        
        # Duration ratio should be reasonable (close to 1.1 due to 10% increase)
        assert 0.8 <= translated_script.duration_ratio <= 1.5
    
    @given(transcript_segment_strategy(), visual_asset_strategy())
    def test_scene_creation_with_assets(self, segment: TranscriptSegment, asset: VisualAsset):
        """
        Feature: multilingual-video-pipeline, Property 20: Scene Segmentation Alignment
        For any Scene, components should be properly aligned.
        """
        scene = Scene(
            scene_id=f"scene_{segment.start_time}",
            transcript_segment=segment,
            visual_asset=asset,
            audio_segment=None,
            duration=segment.duration,
        )
        
        assert scene.scene_id
        assert scene.duration > 0
        assert scene.has_visual
        assert not scene.has_audio  # No audio segment provided
        assert abs(scene.duration - segment.duration) < 0.1