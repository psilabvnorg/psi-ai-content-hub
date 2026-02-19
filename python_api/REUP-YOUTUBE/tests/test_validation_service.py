"""
Unit Tests for ValidationService

Tests all validation methods including:
- Resolution validation
- Audio level validation
- Subtitle synchronization validation
- Output format completeness check
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from src.multilingual_video_pipeline.services.validation_service import (
    ValidationService,
    ValidationReport,
    ValidationIssue,
    ValidationSeverity,
    ValidationServiceError
)


class TestValidationService:
    """Test suite for ValidationService initialization"""
    
    def test_initialization(self):
        """Test ValidationService initializes correctly"""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_dir = Path(tmpdir) / "validation"
            service = ValidationService(cache_dir=cache_dir)
            
            assert service.cache_dir == cache_dir
            assert cache_dir.exists()
    
    def test_default_cache_dir(self):
        """Test default cache directory is created"""
        service = ValidationService()
        assert service.cache_dir == Path("cache/validation")


class TestValidationReport:
    """Test suite for ValidationReport dataclass"""
    
    def test_create_report(self):
        """Test creating a validation report"""
        report = ValidationReport(
            video_path="/path/to/video.mp4",
            passed=True
        )
        
        assert report.video_path == "/path/to/video.mp4"
        assert report.passed is True
        assert len(report.issues) == 0
    
    def test_add_issue_warning(self):
        """Test adding warning doesn't fail the report"""
        report = ValidationReport(
            video_path="/path/to/video.mp4",
            passed=True
        )
        
        issue = ValidationIssue(
            severity=ValidationSeverity.WARNING,
            category="audio",
            message="Audio level slightly low"
        )
        
        report.add_issue(issue)
        assert report.passed is True
        assert len(report.issues) == 1
    
    def test_add_issue_error(self):
        """Test adding error fails the report"""
        report = ValidationReport(
            video_path="/path/to/video.mp4",
            passed=True
        )
        
        issue = ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="resolution",
            message="Resolution too low"
        )
        
        report.add_issue(issue)
        assert report.passed is False
        assert len(report.issues) == 1
    
    def test_to_dict(self):
        """Test report serialization to dict"""
        report = ValidationReport(
            video_path="/path/to/video.mp4",
            passed=False,
            metadata={"test": "data"}
        )
        
        issue = ValidationIssue(
            severity=ValidationSeverity.ERROR,
            category="audio",
            message="Test issue",
            details={"key": "value"}
        )
        report.add_issue(issue)
        
        data = report.to_dict()
        
        assert data["video_path"] == "/path/to/video.mp4"
        assert data["passed"] is False
        assert len(data["issues"]) == 1
        assert data["issues"][0]["severity"] == "error"
        assert data["metadata"]["test"] == "data"
    
    def test_save_report(self):
        """Test saving report to JSON file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "reports" / "test_report.json"
            
            report = ValidationReport(
                video_path="/path/to/video.mp4",
                passed=True
            )
            
            report.save(output_path)
            
            assert output_path.exists()
            
            with open(output_path, 'r') as f:
                data = json.load(f)
            
            assert data["video_path"] == "/path/to/video.mp4"
            assert data["passed"] is True


class TestResolutionValidation:
    """Test suite for resolution validation"""
    
    @patch('subprocess.run')
    def test_validate_resolution_pass(self, mock_run):
        """Test resolution validation passes for 1080p video"""
        # Mock ffprobe output
        mock_run.return_value = Mock(
            stdout=json.dumps({
                "streams": [{"width": 1920, "height": 1080}]
            }),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_resolution(video_path, report)
            
            assert report.passed is True
            assert report.metadata["resolution"]["width"] == 1920
            assert report.metadata["resolution"]["height"] == 1080
    
    @patch('subprocess.run')
    def test_validate_resolution_fail_low(self, mock_run):
        """Test resolution validation warns for sub-1080p video"""
        # Mock ffprobe output
        mock_run.return_value = Mock(
            stdout=json.dumps({
                "streams": [{"width": 1280, "height": 720}]
            }),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_resolution(video_path, report)
            
            # Should be WARNING (one dimension >= 1080), not ERROR
            assert report.passed is True
            assert len(report.issues) == 1
            assert report.issues[0].severity == ValidationSeverity.WARNING
            assert "One dimension below 1080p" in report.issues[0].message
    
    @patch('subprocess.run')
    def test_validate_resolution_vertical(self, mock_run):
        """Test resolution validation for vertical format"""
        # Mock ffprobe output for 9:16 (1080x1920)
        mock_run.return_value = Mock(
            stdout=json.dumps({
                "streams": [{"width": 1080, "height": 1920}]
            }),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_resolution(video_path, report)
            
            assert report.passed is True
            assert report.metadata["resolution"]["width"] == 1080
            assert report.metadata["resolution"]["height"] == 1920
    
    @patch('subprocess.run')
    def test_validate_resolution_no_stream(self, mock_run):
        """Test resolution validation handles missing video stream"""
        # Mock ffprobe output with no streams
        mock_run.return_value = Mock(
            stdout=json.dumps({"streams": []}),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_resolution(video_path, report)
            
            assert report.passed is False
            assert len(report.issues) == 1
            assert "No video stream found" in report.issues[0].message


class TestAudioValidation:
    """Test suite for audio level validation"""
    
    @patch('subprocess.run')
    def test_validate_audio_pass(self, mock_run):
        """Test audio validation passes for correct LUFS level"""
        # Mock ffmpeg loudnorm output
        loudness_json = {
            "input_i": "-16.0",
            "input_lra": "7.5",
            "input_tp": "-2.5"
        }
        
        mock_run.return_value = Mock(
            stdout=f"Some output\n{json.dumps(loudness_json)}",
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_audio_levels(video_path, report)
            
            assert report.passed is True
            assert report.metadata["audio"]["integrated_loudness"] == -16.0
            assert report.metadata["audio"]["true_peak"] == -2.5
    
    @patch('subprocess.run')
    def test_validate_audio_too_quiet(self, mock_run):
        """Test audio validation detects too-quiet audio"""
        loudness_json = {
            "input_i": "-25.0",
            "input_lra": "7.5",
            "input_tp": "-5.0"
        }
        
        mock_run.return_value = Mock(
            stdout=f"Some output\n{json.dumps(loudness_json)}",
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_audio_levels(video_path, report)
            
            # Should be warning, not error
            assert report.passed is True
            assert len(report.issues) == 1
            assert report.issues[0].severity == ValidationSeverity.WARNING
            assert "too quiet" in report.issues[0].message
    
    @patch('subprocess.run')
    def test_validate_audio_too_loud(self, mock_run):
        """Test audio validation detects too-loud audio"""
        loudness_json = {
            "input_i": "-10.0",
            "input_lra": "7.5",
            "input_tp": "-1.5"
        }
        
        mock_run.return_value = Mock(
            stdout=f"Some output\n{json.dumps(loudness_json)}",
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_audio_levels(video_path, report)
            
            # Should be warning, not error
            assert report.passed is True
            assert len(report.issues) == 1
            assert report.issues[0].severity == ValidationSeverity.WARNING
            assert "too loud" in report.issues[0].message
    
    @patch('subprocess.run')
    def test_validate_audio_clipping(self, mock_run):
        """Test audio validation detects clipping"""
        loudness_json = {
            "input_i": "-16.0",
            "input_lra": "7.5",
            "input_tp": "0.5"  # Above -1.0 dBFS = clipping
        }
        
        mock_run.return_value = Mock(
            stdout=f"Some output\n{json.dumps(loudness_json)}",
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_audio_levels(video_path, report)
            
            assert report.passed is False
            assert any("clipping" in issue.message for issue in report.issues)


class TestSubtitleValidation:
    """Test suite for subtitle synchronization validation"""
    
    @patch('subprocess.run')
    def test_validate_subtitles_embedded(self, mock_run):
        """Test subtitle validation finds embedded subtitles"""
        # Mock ffprobe output with subtitle stream
        mock_run.return_value = Mock(
            stdout=json.dumps({
                "streams": [
                    {"index": 0, "codec_name": "subrip"}
                ]
            }),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_subtitle_sync(video_path, report)
            
            assert report.metadata["subtitles"]["type"] == "embedded"
            assert report.metadata["subtitles"]["streams"] == 1
    
    @patch('subprocess.run')
    def test_validate_subtitles_external(self, mock_run):
        """Test subtitle validation finds external .srt file"""
        # Mock ffprobe output with no subtitle streams
        mock_run.return_value = Mock(
            stdout=json.dumps({"streams": []}),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            # Create external .srt file
            srt_path = video_path.with_suffix(".srt")
            srt_path.write_text("""1
00:00:01,000 --> 00:00:03,000
First subtitle

2
00:00:03,500 --> 00:00:06,000
Second subtitle
""")
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_subtitle_sync(video_path, report)
            
            assert report.metadata["subtitles"]["type"] == "external"
    
    @patch('subprocess.run')
    def test_validate_subtitles_none(self, mock_run):
        """Test subtitle validation handles missing subtitles"""
        # Mock ffprobe output with no subtitle streams
        mock_run.return_value = Mock(
            stdout=json.dumps({"streams": []}),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report = ValidationReport(video_path=str(video_path), passed=True)
            service._validate_subtitle_sync(video_path, report)
            
            # Should warn about missing subtitles
            assert any("No subtitles found" in issue.message for issue in report.issues)
    
    def test_parse_srt_time(self):
        """Test SRT timestamp parsing"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            
            # Test valid timestamp
            ms = service._parse_srt_time("00:01:23,500")
            assert ms == 83500.0
            
            # Test another format
            ms = service._parse_srt_time("01:00:00,000")
            assert ms == 3600000.0
            
            # Test invalid format
            ms = service._parse_srt_time("invalid")
            assert ms is None


class TestBatchValidation:
    """Test suite for batch output completeness validation"""
    
    def test_validate_batch_complete(self):
        """Test batch validation passes for complete outputs"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            output_dir = Path(tmpdir) / "outputs"
            
            # Create complete output structure
            languages = ["en", "vi"]
            formats = {"en": ["16:9"], "vi": ["16:9", "9:16"]}
            
            for lang in languages:
                for fmt in formats[lang]:
                    fmt_dir = output_dir / lang / fmt
                    fmt_dir.mkdir(parents=True)
                    
                    # Create required files
                    (fmt_dir / "video.mp4").touch()
                    (fmt_dir / "metadata.json").write_text("{}")
                    (fmt_dir / "thumbnail.jpg").touch()
            
            report = service.validate_batch_outputs(
                output_dir=output_dir,
                expected_languages=languages,
                expected_formats=formats
            )
            
            assert report.passed is True
            assert len([i for i in report.issues if i.severity == ValidationSeverity.ERROR]) == 0
    
    def test_validate_batch_missing_language(self):
        """Test batch validation detects missing language directory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            output_dir = Path(tmpdir) / "outputs"
            output_dir.mkdir()
            
            # Create only English, missing Vietnamese
            en_dir = output_dir / "en" / "16:9"
            en_dir.mkdir(parents=True)
            (en_dir / "video.mp4").touch()
            
            report = service.validate_batch_outputs(
                output_dir=output_dir,
                expected_languages=["en", "vi"],
                expected_formats={"en": ["16:9"], "vi": ["16:9"]}
            )
            
            assert report.passed is False
            assert any("Missing language directory: vi" in issue.message for issue in report.issues)
    
    def test_validate_batch_missing_format(self):
        """Test batch validation detects missing format directory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            output_dir = Path(tmpdir) / "outputs"
            
            # Create language dir but missing format
            lang_dir = output_dir / "vi"
            lang_dir.mkdir(parents=True)
            
            # Create 16:9 but missing 9:16
            fmt_dir = lang_dir / "16:9"
            fmt_dir.mkdir()
            (fmt_dir / "video.mp4").touch()
            
            report = service.validate_batch_outputs(
                output_dir=output_dir,
                expected_languages=["vi"],
                expected_formats={"vi": ["16:9", "9:16"]}
            )
            
            assert report.passed is False
            assert any("Missing format directory: vi/9:16" in issue.message for issue in report.issues)
    
    def test_validate_batch_missing_files(self):
        """Test batch validation detects missing required files"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            output_dir = Path(tmpdir) / "outputs"
            
            # Create directory but no files
            fmt_dir = output_dir / "en" / "16:9"
            fmt_dir.mkdir(parents=True)
            
            report = service.validate_batch_outputs(
                output_dir=output_dir,
                expected_languages=["en"],
                expected_formats={"en": ["16:9"]}
            )
            
            assert report.passed is False
            assert any("Missing video file" in issue.message for issue in report.issues)
    
    def test_validate_batch_missing_metadata(self):
        """Test batch validation warns about missing metadata"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            output_dir = Path(tmpdir) / "outputs"
            
            # Create directory with video but no metadata
            fmt_dir = output_dir / "en" / "16:9"
            fmt_dir.mkdir(parents=True)
            (fmt_dir / "video.mp4").touch()
            
            report = service.validate_batch_outputs(
                output_dir=output_dir,
                expected_languages=["en"],
                expected_formats={"en": ["16:9"]}
            )
            
            # Should have warnings but might still pass
            assert any("Missing metadata" in issue.message for issue in report.issues)


class TestFullValidation:
    """Test suite for complete video validation workflow"""
    
    def test_validate_video_not_found(self):
        """Test validation fails gracefully for missing file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "nonexistent.mp4"
            
            with pytest.raises(ValidationServiceError, match="Video file not found"):
                service.validate_video(video_path)
    
    @patch('subprocess.run')
    def test_validate_and_save(self, mock_run):
        """Test validate_and_save creates report file"""
        # Mock ffprobe output
        mock_run.return_value = Mock(
            stdout=json.dumps({
                "streams": [{"width": 1920, "height": 1080}]
            }),
            returncode=0
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = ValidationService(cache_dir=Path(tmpdir))
            video_path = Path(tmpdir) / "test_video.mp4"
            video_path.touch()
            
            report, report_path = service.validate_and_save(
                video_path,
                check_audio=False,
                check_subtitles=False
            )
            
            assert report_path.exists()
            assert report.passed is True
            
            # Verify saved content
            with open(report_path, 'r') as f:
                data = json.load(f)
            
            assert data["video_path"] == str(video_path)
            assert data["passed"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
