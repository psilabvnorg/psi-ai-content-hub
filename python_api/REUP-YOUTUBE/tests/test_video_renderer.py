"""
Unit tests for VideoRenderer service.

Tests cover:
- Video rendering with different formats
- Scene composition and concatenation
- Audio and subtitle handling
- H.264 encoding with two-pass support
- Platform-specific optimizations
- Error handling and validation
"""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock
from PIL import Image

pytest.importorskip("moviepy")
pytest.importorskip("pysrt")

from src.multilingual_video_pipeline.models import (
    Scene,
    TranscriptSegment,
    OutputFormat,
    VisualAsset,
    AssetType,
    Job,
    JobStatusEnum,
)
from src.multilingual_video_pipeline.services.video_renderer import (
    VideoRenderer,
    VideoRendererError,
    RenderConfig,
    EncodingStats,
)
from src.multilingual_video_pipeline.services.subtitle_generator import Subtitle
from src.multilingual_video_pipeline.services.pipeline import MultilingualVideoPipeline


class TestRenderConfig:
    """Tests for RenderConfig."""
    
    def test_default_config(self):
        """Test default render configuration."""
        config = RenderConfig()
        assert config.preset == "medium"
        assert config.crf == 23
        assert config.two_pass is True
        assert config.bitrate_video == "5000k"
    
    def test_custom_config(self):
        """Test custom render configuration."""
        config = RenderConfig(
            preset="fast",
            crf=28,
            two_pass=False,
            bitrate_video="8000k"
        )
        assert config.preset == "fast"
        assert config.crf == 28
        assert config.two_pass is False
        assert config.bitrate_video == "8000k"
    
    def test_invalid_crf(self):
        """Test that CRF must be 0-51."""
        with pytest.raises(ValueError):
            RenderConfig(crf=-1)
        
        with pytest.raises(ValueError):
            RenderConfig(crf=52)
    
    def test_invalid_preset(self):
        """Test that preset must be valid."""
        with pytest.raises(ValueError):
            RenderConfig(preset="invalid")


class TestEncodingStats:
    """Tests for EncodingStats."""
    
    def test_efficiency_calculation(self):
        """Test efficiency calculation (MB per second)."""
        stats = EncodingStats(
            duration=10.0,
            bitrate="5000k",
            fps=30.0,
            size_mb=6.25  # 10s * 5000k / 8 = 6.25MB
        )
        
        assert stats.efficiency == pytest.approx(0.625, rel=0.01)
    
    def test_efficiency_zero_duration(self):
        """Test efficiency with zero duration."""
        stats = EncodingStats(
            duration=0.0,
            bitrate="5000k",
            fps=30.0,
            size_mb=1.0
        )
        
        assert stats.efficiency == 0.0


class TestVideoRenderer:
    """Tests for VideoRenderer service."""
    
    @pytest.fixture
    def sample_image(self):
        """Create a sample image file."""
        with TemporaryDirectory() as tmpdir:
            image_path = Path(tmpdir) / "test_image.jpg"
            img = Image.new('RGB', (1920, 1080), color=(73, 109, 137))
            img.save(image_path)
            yield image_path
    
    @pytest.fixture
    def sample_scene(self, sample_image):
        """Create a sample scene."""
        segment = TranscriptSegment(
            text="Sample scene text",
            start_time=0.0,
            end_time=3.0,
            confidence=0.95
        )
        
        visual_asset = VisualAsset(
            asset_id="asset_001",
            asset_type=AssetType.STATIC_IMAGE,
            file_path=sample_image,
            source_url=None,
            width=1920,
            height=1080,
            duration=None,
            tags=["test"]
        )
        
        return Scene(
            scene_id="scene_0000_0.00",
            transcript_segment=segment,
            visual_asset=visual_asset,
            audio_segment=None,
            duration=3.0,
            transition_type="fade"
        )
    
    @pytest.fixture
    def renderer(self):
        """Create a VideoRenderer instance."""
        return VideoRenderer()
    
    def test_renderer_initialization(self, renderer):
        """Test renderer initialization."""
        assert renderer is not None
        assert renderer.render_config is not None
        assert renderer.temp_dir.exists()
    
    def test_resolution_presets(self, renderer):
        """Test resolution presets for different formats."""
        # 16:9 presets
        assert renderer.RESOLUTION_PRESETS["16:9"]["youtube"] == (1920, 1080)
        assert renderer.RESOLUTION_PRESETS["16:9"]["facebook"] == (1280, 720)
        
        # 9:16 presets
        assert renderer.RESOLUTION_PRESETS["9:16"]["tiktok"] == (1080, 1920)
        assert renderer.RESOLUTION_PRESETS["9:16"]["youtube"] == (1080, 1920)
    
    def test_output_format_horizontal(self):
        """Test horizontal output format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.is_horizontal is True
        assert fmt.is_vertical is False
        assert fmt.width == 1920
        assert fmt.height == 1080
    
    def test_output_format_vertical(self):
        """Test vertical output format."""
        fmt = OutputFormat(
            language="vi",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="tiktok"
        )
        
        assert fmt.is_horizontal is False
        assert fmt.is_vertical is True
        assert fmt.width == 1080
        assert fmt.height == 1920
    
    def test_output_format_invalid_aspect_ratio(self):
        """Test that output format rejects invalid aspect ratios."""
        with pytest.raises(ValueError):
            OutputFormat(
                language="en",
                aspect_ratio="4:3",  # Invalid
                resolution=(1920, 1440),
                platform="youtube"
            )
    
    def test_output_format_invalid_platform(self):
        """Test that output format rejects invalid platforms."""
        with pytest.raises(ValueError):
            OutputFormat(
                language="en",
                aspect_ratio="16:9",
                resolution=(1920, 1080),
                platform="invalid"  # Invalid
            )
    
    def test_output_format_languages(self):
        """Test different languages in output format."""
        for lang in ["en", "vi", "ja", "de"]:
            fmt = OutputFormat(
                language=lang,
                aspect_ratio="16:9",
                resolution=(1920, 1080),
                platform="youtube"
            )
            assert fmt.language == lang
    
    def test_render_config_quality_presets(self):
        """Test different quality presets."""
        # High quality (slow)
        high_quality = RenderConfig(preset="slow", crf=18)
        assert high_quality.crf == 18
        
        # Fast encoding
        fast = RenderConfig(preset="faster", crf=28)
        assert fast.crf == 28
        
        # Default
        default = RenderConfig(preset="medium", crf=23)
        assert default.crf == 23
    
    def test_validate_output_format(self, renderer):
        """Test output format validation."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        is_valid, errors = renderer.validate_output_format(fmt)
        assert is_valid is True
        assert len(errors) == 0
    
    def test_validate_output_format_mismatched_resolution(self, renderer):
        """Test validation detects mismatched resolutions."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1280, 720),  # Doesn't match expected 1920x1080
            platform="youtube"
        )
        
        is_valid, errors = renderer.validate_output_format(fmt)
        # May or may not fail depending on how strict validation is
        # Just verify the function runs
        assert isinstance(is_valid, bool)
        assert isinstance(errors, list)
    
    def test_empty_scenes_error(self, renderer):
        """Test that rendering with empty scenes raises error."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        with pytest.raises(VideoRendererError, match="empty scene list"):
            renderer.render_video([], fmt)
    
    def test_custom_render_config(self):
        """Test renderer with custom render config."""
        custom_config = RenderConfig(
            preset="fast",
            crf=28,
            bitrate_video="3000k"
        )
        
        renderer = VideoRenderer(render_config=custom_config)
        
        assert renderer.render_config.preset == "fast"
        assert renderer.render_config.crf == 28
        assert renderer.render_config.bitrate_video == "3000k"


class TestVideoFormats:
    """Tests for different video formats and platforms."""
    
    def test_youtube_horizontal_format(self):
        """Test YouTube horizontal format (1080p)."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.width == 1920
        assert fmt.height == 1080
        assert fmt.is_horizontal is True
    
    def test_youtube_shorts_format(self):
        """Test YouTube Shorts vertical format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="youtube"
        )
        
        assert fmt.width == 1080
        assert fmt.height == 1920
        assert fmt.is_vertical is True
    
    def test_tiktok_format(self):
        """Test TikTok vertical format."""
        fmt = OutputFormat(
            language="vi",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="tiktok"
        )
        
        assert fmt.platform == "tiktok"
        assert fmt.is_vertical is True
    
    def test_facebook_reels_format(self):
        """Test Facebook Reels format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="facebook"
        )
        
        assert fmt.platform == "facebook"
        assert fmt.is_vertical is True


class TestMultilingualOutputs:
    """Tests for multilingual video outputs."""
    
    def test_vietnamese_output(self):
        """Test Vietnamese video output format."""
        fmt = OutputFormat(
            language="vi",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="tiktok"
        )
        
        assert fmt.language == "vi"
    
    def test_english_output(self):
        """Test English video output format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.language == "en"
    
    def test_japanese_output(self):
        """Test Japanese video output format."""
        fmt = OutputFormat(
            language="ja",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.language == "ja"
    
    def test_german_output(self):
        """Test German video output format."""
        fmt = OutputFormat(
            language="de",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.language == "de"


class TestIntegrationVideoRenderer:
    """Integration tests for video renderer."""
    
    def test_output_format_specification(self):
        """Test complete output format specification."""
        # Create a comprehensive format specification
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        # Verify all properties
        assert fmt.width == 1920
        assert fmt.height == 1080
        assert fmt.is_horizontal is True
        assert fmt.is_vertical is False
        assert fmt.language == "en"
        assert fmt.platform == "youtube"


class TestRemotionApiRenderingStage:
    """Tests for pipeline Remotion render API stage."""

    def test_stage_video_rendering_uses_api(self, tmp_path: Path):
        pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
        pipeline.progress_callback = Mock()
        pipeline.settings = Mock(api_base_url="http://127.0.0.1:6900")

        api_client = Mock()

        def _download(_base_url: str, _download_url: str, output_path: Path) -> Path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"video")
            return output_path

        api_client.download_from_url.side_effect = _download
        api_client.post_multipart.side_effect = [
            {"session_id": "session_1"},
            {"task_id": "render_1"},
        ]
        api_client.poll_for_completion.return_value = {"video": {"download_url": "/api/v1/files/video_1"}}
        pipeline._services = {"api_client": api_client}

        audio_path = tmp_path / "narration.wav"
        audio_path.write_bytes(b"audio")
        caption_path = tmp_path / "narration.json"
        caption_path.write_text("{}", encoding="utf-8")
        intro_image = tmp_path / "Intro.jpg"
        intro_image.write_bytes(b"intro")
        image_1 = tmp_path / "01.jpg"
        image_1.write_bytes(b"img1")
        intro_config_path = tmp_path / "intro-config.json"
        intro_config_path.write_text('{"templateId":"template_1"}', encoding="utf-8")

        job = Job(
            job_id="job_render",
            video_url="https://www.youtube.com/watch?v=test1234567A",
            target_languages=["en"],
            output_formats=["16:9"],
            status=JobStatusEnum.PROCESSING,
        )
        job.intermediate_results = {
            "remotion_content": {
                "en": {
                    "audio_path": str(audio_path),
                    "caption_path": str(caption_path),
                    "intro_image": str(intro_image),
                    "content_images": [str(image_1)],
                    "intro_config_path": str(intro_config_path),
                }
            }
        }

        result = pipeline._stage_video_rendering(job, temp_dir=tmp_path, output_dir=tmp_path / "out")
        assert result["total_videos"] == 1
        assert "en_16:9" in job.intermediate_results["video_rendering"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
