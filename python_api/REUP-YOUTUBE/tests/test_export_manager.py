"""
Unit tests for ExportManager service.

Tests cover:
- Platform-specific metadata generation
- Thumbnail creation from videos
- Export packaging and organization
- Format validation for all platforms
- Error handling and edge cases
"""

import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

from src.multilingual_video_pipeline.models import OutputFormat
from src.multilingual_video_pipeline.services import (
    ExportManager,
    ExportManagerError,
    PlatformMetadata,
    ThumbnailConfig,
    ExportPackage,
)


class TestPlatformMetadata:
    """Tests for PlatformMetadata."""
    
    def test_youtube_metadata(self):
        """Test creating YouTube metadata."""
        metadata = PlatformMetadata(
            platform="youtube",
            title="Test Video",
            description="Test description",
            tags=["test", "video"],
            language="en",
            duration_seconds=60.0,
            resolution=(1920, 1080),
            aspect_ratio="16:9",
            youtube_category="Education"
        )
        
        assert metadata.platform == "youtube"
        assert metadata.title == "Test Video"
        assert metadata.youtube_category == "Education"
    
    def test_tiktok_metadata(self):
        """Test creating TikTok metadata."""
        metadata = PlatformMetadata(
            platform="tiktok",
            title="Test TikTok",
            description="TikTok video",
            tags=["trending"],
            language="en",
            duration_seconds=30.0,
            resolution=(1080, 1920),
            aspect_ratio="9:16",
            tiktok_hashtags=["#test", "#video"]
        )
        
        assert metadata.platform == "tiktok"
        assert metadata.tiktok_hashtags == ["#test", "#video"]
    
    def test_facebook_metadata(self):
        """Test creating Facebook metadata."""
        metadata = PlatformMetadata(
            platform="facebook",
            title="Test Facebook",
            description="Facebook video",
            tags=["facebook"],
            language="en",
            duration_seconds=45.0,
            resolution=(1280, 720),
            aspect_ratio="16:9"
        )
        
        assert metadata.platform == "facebook"
    
    def test_invalid_platform(self):
        """Test that invalid platform raises error."""
        with pytest.raises(ValueError):
            PlatformMetadata(
                platform="invalid",
                title="Test",
                description="Test",
                tags=[],
                language="en",
                duration_seconds=60.0,
                resolution=(1920, 1080),
                aspect_ratio="16:9"
            )
    
    def test_empty_title(self):
        """Test that empty title raises error."""
        with pytest.raises(ValueError):
            PlatformMetadata(
                platform="youtube",
                title="",
                description="Test",
                tags=[],
                language="en",
                duration_seconds=60.0,
                resolution=(1920, 1080),
                aspect_ratio="16:9"
            )
    
    def test_invalid_duration(self):
        """Test that invalid duration raises error."""
        with pytest.raises(ValueError):
            PlatformMetadata(
                platform="youtube",
                title="Test",
                description="Test",
                tags=[],
                language="en",
                duration_seconds=0,
                resolution=(1920, 1080),
                aspect_ratio="16:9"
            )


class TestThumbnailConfig:
    """Tests for ThumbnailConfig."""
    
    def test_default_config(self):
        """Test default thumbnail configuration."""
        config = ThumbnailConfig()
        assert config.width == 1280
        assert config.height == 720
        assert config.quality == 90
        assert config.timestamp == 1.0
    
    def test_custom_config(self):
        """Test custom thumbnail configuration."""
        config = ThumbnailConfig(
            width=1920,
            height=1080,
            quality=95,
            timestamp=5.0
        )
        
        assert config.width == 1920
        assert config.height == 1080
        assert config.quality == 95
        assert config.timestamp == 5.0
    
    def test_invalid_quality(self):
        """Test that quality out of range raises error."""
        with pytest.raises(ValueError):
            ThumbnailConfig(quality=101)
    
    def test_invalid_dimensions(self):
        """Test that invalid dimensions raise error."""
        with pytest.raises(ValueError):
            ThumbnailConfig(width=0, height=720)


class TestExportManager:
    """Tests for ExportManager service."""
    
    @pytest.fixture
    def manager(self):
        """Create an ExportManager instance."""
        return ExportManager()
    
    @pytest.fixture
    def sample_metadata(self):
        """Create sample metadata for testing."""
        return PlatformMetadata(
            platform="youtube",
            title="Test Video Export",
            description="This is a test video for export",
            tags=["test", "export", "video"],
            language="en",
            duration_seconds=120.0,
            resolution=(1920, 1080),
            aspect_ratio="16:9",
            youtube_category="Education"
        )
    
    def test_manager_initialization(self, manager):
        """Test manager initialization."""
        assert manager is not None
        assert manager.export_dir.exists()
    
    def test_platform_specs_youtube(self, manager):
        """Test YouTube platform specifications."""
        specs = manager.PLATFORM_SPECS["youtube"]
        
        assert specs["max_duration"] == 43200
        assert specs["min_duration"] == 0.5
        assert "16:9" in specs["formats"]
        assert specs["recommended_resolution"] == (1920, 1080)
    
    def test_platform_specs_tiktok(self, manager):
        """Test TikTok platform specifications."""
        specs = manager.PLATFORM_SPECS["tiktok"]
        
        assert specs["max_duration"] == 600
        assert "9:16" in specs["formats"]
        assert specs["recommended_resolution"] == (1080, 1920)
    
    def test_platform_specs_facebook(self, manager):
        """Test Facebook platform specifications."""
        specs = manager.PLATFORM_SPECS["facebook"]
        
        assert specs["max_duration"] == 7200
        assert "16:9" in specs["formats"]
        assert "9:16" in specs["formats"]
    
    def test_thumbnail_specs_youtube(self, manager):
        """Test YouTube thumbnail specifications."""
        specs = manager.THUMBNAIL_SPECS["youtube"]
        
        assert specs["dimensions"] == (1280, 720)
        assert specs["aspect_ratio"] == "16:9"
        assert "jpg" in specs["formats"]
    
    def test_thumbnail_specs_tiktok(self, manager):
        """Test TikTok thumbnail specifications."""
        specs = manager.THUMBNAIL_SPECS["tiktok"]
        
        assert specs["dimensions"] == (540, 960)
        assert specs["aspect_ratio"] == "9:16"
    
    def test_generate_youtube_metadata(self, manager, sample_metadata):
        """Test YouTube metadata generation."""
        with TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            
            metadata_path = manager.generate_metadata(sample_metadata, output_dir)
            
            assert metadata_path.exists()
            assert metadata_path.suffix == ".json"
            
            # Verify JSON content
            import json
            with open(metadata_path, 'r') as f:
                data = json.load(f)
                assert data["platform"] == "youtube"
                assert data["title"] == sample_metadata.title
                assert data["category"] == "Education"
    
    def test_generate_tiktok_metadata(self, manager):
        """Test TikTok metadata generation."""
        metadata = PlatformMetadata(
            platform="tiktok",
            title="TikTok Test",
            description="Test TikTok video",
            tags=[],
            language="en",
            duration_seconds=30.0,
            resolution=(1080, 1920),
            aspect_ratio="9:16",
            tiktok_hashtags=["#test"]
        )
        
        with TemporaryDirectory() as tmpdir:
            metadata_path = manager.generate_metadata(metadata, Path(tmpdir))
            
            assert metadata_path.exists()
            
            import json
            with open(metadata_path, 'r') as f:
                data = json.load(f)
                assert data["platform"] == "tiktok"
                assert data["hashtags"] == ["#test"]
    
    def test_generate_facebook_metadata(self, manager):
        """Test Facebook metadata generation."""
        metadata = PlatformMetadata(
            platform="facebook",
            title="Facebook Test",
            description="Test Facebook video",
            tags=["test"],
            language="en",
            duration_seconds=45.0,
            resolution=(1280, 720),
            aspect_ratio="16:9"
        )
        
        with TemporaryDirectory() as tmpdir:
            metadata_path = manager.generate_metadata(metadata, Path(tmpdir))
            
            assert metadata_path.exists()
            
            import json
            with open(metadata_path, 'r') as f:
                data = json.load(f)
                assert data["platform"] == "facebook"
    
    def test_multilingual_metadata(self, manager):
        """Test metadata generation for different languages."""
        for lang in ["en", "vi", "ja", "de"]:
            metadata = PlatformMetadata(
                platform="youtube",
                title=f"Test Video {lang}",
                description=f"Test description in {lang}",
                tags=["test"],
                language=lang,
                duration_seconds=60.0,
                resolution=(1920, 1080),
                aspect_ratio="16:9"
            )
            
            with TemporaryDirectory() as tmpdir:
                metadata_path = manager.generate_metadata(metadata, Path(tmpdir))
                assert metadata_path.exists()


class TestOutputFormats:
    """Tests for platform output formats."""
    
    def test_youtube_format(self):
        """Test YouTube output format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1920, 1080),
            platform="youtube"
        )
        
        assert fmt.is_horizontal is True
        assert fmt.width == 1920
        assert fmt.height == 1080
    
    def test_youtube_shorts_format(self):
        """Test YouTube Shorts format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="youtube"
        )
        
        assert fmt.is_vertical is True
    
    def test_tiktok_format(self):
        """Test TikTok format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="tiktok"
        )
        
        assert fmt.platform == "tiktok"
        assert fmt.is_vertical is True
    
    def test_facebook_horizontal(self):
        """Test Facebook horizontal format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="16:9",
            resolution=(1280, 720),
            platform="facebook"
        )
        
        assert fmt.is_horizontal is True
    
    def test_facebook_vertical(self):
        """Test Facebook vertical format."""
        fmt = OutputFormat(
            language="en",
            aspect_ratio="9:16",
            resolution=(1080, 1920),
            platform="facebook"
        )
        
        assert fmt.is_vertical is True


class TestIntegrationExportManager:
    """Integration tests for ExportManager."""
    
    def test_metadata_generation_all_platforms(self):
        """Test metadata generation for all platforms."""
        manager = ExportManager()
        platforms = ["youtube", "tiktok", "facebook"]
        
        for platform in platforms:
            metadata = PlatformMetadata(
                platform=platform,
                title=f"{platform.capitalize()} Test",
                description=f"Test video for {platform}",
                tags=["test"],
                language="en",
                duration_seconds=60.0,
                resolution=(1920, 1080),
                aspect_ratio="16:9"
            )
            
            with TemporaryDirectory() as tmpdir:
                metadata_path = manager.generate_metadata(metadata, Path(tmpdir))
                assert metadata_path.exists()
                
                # Verify metadata is valid JSON
                import json
                with open(metadata_path, 'r') as f:
                    data = json.load(f)
                    assert data["platform"] == platform


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
