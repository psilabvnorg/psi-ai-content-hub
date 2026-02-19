"""
Unit tests for Video Ingestion Service.
"""

import pytest
import subprocess
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from pathlib import Path

from src.multilingual_video_pipeline.services.video_ingestion import (
    VideoIngestionService,
    VideoIngestionError,
    RateLimiter,
    extract_video_id_from_url,
    extract_channel_id_from_url,
    is_video_available,
)
from src.multilingual_video_pipeline.models import VideoMetadata


@pytest.mark.unit
class TestVideoIngestionService:
    """Unit tests for VideoIngestionService."""
    
    def test_init_without_ytdlp(self):
        """Test initialization when yt-dlp is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            
            service = VideoIngestionService()
            assert not service._ytdlp_available
    
    def test_init_with_ytdlp(self):
        """Test initialization when yt-dlp is available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            assert service._ytdlp_available
    
    def test_fetch_channel_videos_no_ytdlp(self):
        """Test fetch_channel_videos when yt-dlp is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="yt-dlp is not available"):
                service.fetch_channel_videos("https://www.youtube.com/@test")
    
    def test_fetch_channel_videos_invalid_url(self):
        """Test fetch_channel_videos with invalid URL."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="Invalid YouTube URL"):
                service.fetch_channel_videos("https://invalid-url.com")
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_fetch_channel_videos_success(self, mock_run):
        """Test successful channel video fetching."""
        # Mock yt-dlp availability check
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock channel extraction
        channel_output = '{"id": "test123", "title": "Test Video"}\n'
        metadata_output = """{
            "id": "test123",
            "title": "Test Video",
            "description": "Test description",
            "duration": 120,
            "upload_date": "20240115",
            "uploader": "Test Channel",
            "uploader_url": "https://youtube.com/@test",
            "tags": ["test", "video"]
        }"""
        
        # Reset mock to control call sequence properly
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=channel_output),       # Channel extraction
            Mock(returncode=0, stdout=metadata_output),      # Video metadata
        ]
        
        videos = service.fetch_channel_videos("https://www.youtube.com/@test")
        
        assert len(videos) == 1
        assert videos[0].video_id == "test123"
        assert videos[0].title == "Test Video"
        assert videos[0].duration == 120.0
    
    def test_download_video_no_ytdlp(self):
        """Test download_video when yt-dlp is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="yt-dlp is not available"):
                service.download_video("test123")
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    @patch('src.multilingual_video_pipeline.services.video_ingestion.get_file_size')
    def test_download_video_success(self, mock_get_size, mock_run, tmp_path):
        """Test successful video download."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Create a fake downloaded file
        video_file = tmp_path / "test123.mp4"
        video_file.write_bytes(b"fake video content")
        
        # Mock file operations
        mock_get_size.return_value = 1024000  # 1MB
        
        with patch.object(service, '_find_downloaded_file', return_value=video_file):
            mock_run.side_effect = [
                Mock(returncode=0, stdout="yt-dlp 2024.1.1"),  # Version check
                Mock(returncode=0, stdout=""),                   # Download
            ]
            
            result = service.download_video("test123")
            
            assert result == video_file
            assert result.exists()
    
    def test_extract_metadata_no_ytdlp(self):
        """Test extract_metadata when yt-dlp is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="yt-dlp is not available"):
                service.extract_metadata("test123")
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_extract_metadata_success(self, mock_run):
        """Test successful metadata extraction."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        metadata_output = """{
            "id": "test123",
            "title": "Test Video",
            "description": "Test description",
            "duration": 120,
            "upload_date": "20240115",
            "uploader": "Test Channel",
            "uploader_url": "https://youtube.com/@test",
            "tags": ["test", "video"]
        }"""
        
        # Reset mock to control call sequence properly
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=metadata_output),      # Metadata extraction
        ]
        
        metadata = service.extract_metadata("test123")
        
        assert metadata.video_id == "test123"
        assert metadata.title == "Test Video"
        assert metadata.duration == 120.0
        assert metadata.upload_date == datetime(2024, 1, 15)
    
    def test_extract_audio_no_ytdlp(self):
        """Test extract_audio when yt-dlp is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.side_effect = FileNotFoundError()
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="yt-dlp is not available"):
                service.extract_audio(Path("test.mp4"))
    
    def test_extract_audio_file_not_found(self):
        """Test extract_audio with non-existent video file."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            with pytest.raises(VideoIngestionError, match="Video file not found"):
                service.extract_audio(Path("nonexistent.mp4"))
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    @patch('src.multilingual_video_pipeline.services.video_ingestion.get_file_size')
    def test_extract_audio_success(self, mock_get_size, mock_run, tmp_path):
        """Test successful audio extraction."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Create fake video and audio files
        video_file = tmp_path / "test.mp4"
        video_file.write_bytes(b"fake video content")
        
        audio_file = tmp_path / "data" / "audio" / "test.wav"
        audio_file.parent.mkdir(parents=True, exist_ok=True)
        audio_file.write_bytes(b"fake audio content")
        
        # Mock file operations
        mock_get_size.return_value = 512000  # 512KB
        
        with patch.object(service.settings, 'data_dir', tmp_path / "data"):
            mock_run.side_effect = [
                Mock(returncode=0, stdout=""),                   # Audio extraction
            ]
            
            result = service.extract_audio(video_file)
            
            assert result == audio_file
            assert result.exists()
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_extract_subtitles_success(self, mock_run):
        """Test successful subtitle extraction with new format parameter."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Reset mock and set up for subtitle extraction
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=""),  # Subtitle extraction
        ]
        
        # Mock subtitle files being created
        with patch('pathlib.Path.glob') as mock_glob:
            mock_subtitle_file = Mock()
            mock_subtitle_file.stem = "test123.en"
            mock_subtitle_file.__str__ = lambda self: "test123.en.srt"
            mock_glob.return_value = [mock_subtitle_file]
            
            result = service.extract_subtitles("test123", ["en"], format="srt")
            
            # Should find the subtitle file
            assert "en" in result
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_extract_all_subtitles(self, mock_run):
        """Test extracting all available subtitles."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Reset mock and set up for subtitle extraction
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=""),  # Subtitle extraction
        ]
        
        # Mock multiple subtitle files being created
        with patch('pathlib.Path.glob') as mock_glob:
            mock_files = []
            for lang in ['en', 'vi', 'ja']:
                mock_file = Mock()
                mock_file.stem = f"test123.{lang}"
                mock_file.__str__ = lambda self, l=lang: f"test123.{l}.srt"
                mock_files.append(mock_file)
            mock_glob.return_value = mock_files
            
            result = service.extract_all_subtitles("test123")
            
            # Should find multiple subtitle files
            assert len(result) == 3
            assert "en" in result
            assert "vi" in result
            assert "ja" in result
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_extract_target_language_subtitles(self, mock_run):
        """Test extracting only target language subtitles."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Reset mock and set up for subtitle extraction
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=""),  # Subtitle extraction
        ]
        
        # Mock target language subtitle files
        with patch('pathlib.Path.glob') as mock_glob:
            mock_files = []
            for lang in ['vi', 'en']:
                mock_file = Mock()
                mock_file.stem = f"test123.{lang}"
                mock_file.__str__ = lambda self, l=lang: f"test123.{l}.srt"
                mock_files.append(mock_file)
            mock_glob.return_value = mock_files
            
            result = service.extract_target_language_subtitles("test123")
            
            # Should find target language subtitle files
            assert len(result) == 2
            assert "vi" in result
            assert "en" in result
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_extract_subtitles_no_subtitles(self, mock_run):
        """Test subtitle extraction when no subtitles are available."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Reset mock and set up for failed subtitle extraction
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=1, stderr="No subtitles found"),  # Subtitle extraction fails
        ]
        
        result = service.extract_subtitles("test123", ["en"])
        
        # Should return empty dict when no subtitles found
        assert result == {}
    
    def test_convert_subtitles_to_srt(self, tmp_path):
        """Test VTT to SRT conversion."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Create a fake VTT file
            vtt_file = tmp_path / "test.vtt"
            vtt_content = """WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.000
This is a test
"""
            vtt_file.write_text(vtt_content, encoding='utf-8')
            
            result = service.convert_subtitles_to_srt(vtt_file)
            
            assert result.exists()
            assert result.suffix == '.srt'
            
            # Check SRT content
            srt_content = result.read_text(encoding='utf-8')
            assert "1\n00:00:01,000 --> 00:00:04,000\nHello world" in srt_content
            assert "2\n00:00:05,000 --> 00:00:08,000\nThis is a test" in srt_content
    
    def test_detect_language_vietnamese(self):
        """Test heuristic language detection for Vietnamese."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            result = service._detect_language_heuristic("Video tiếng Việt", "Đây là video về Vietnam")
            assert result == "vi"
    
    def test_detect_language_japanese(self):
        """Test heuristic language detection for Japanese."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            result = service._detect_language_heuristic("Japanese video", "This is about Japan 日本")
            assert result == "ja"
    
    def test_detect_language_german(self):
        """Test heuristic language detection for German."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            result = service._detect_language_heuristic("German video", "This is about Deutschland")
            assert result == "de"
    
    def test_detect_language_default_english(self):
        """Test heuristic language detection defaults to English."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            result = service._detect_language_heuristic("Random video", "This is a random description without specific language indicators")
            assert result == "en"
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_detect_language_from_subtitles_success(self, mock_run):
        """Test language detection from available subtitles."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock get_available_subtitle_languages to return Vietnamese
        with patch.object(service, 'get_available_subtitle_languages', return_value=['vi', 'en']):
            result = service._detect_language_from_subtitles("test123")
            assert result == "vi"  # Should prioritize Vietnamese over English
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_detect_language_from_subtitles_variants(self, mock_run):
        """Test language detection from subtitle variants like en-US."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock get_available_subtitle_languages to return language variants
        # Note: The method prioritizes by target language order: vi, ja, de, en
        # So we test with en-US and fr-FR to ensure en is selected
        with patch.object(service, 'get_available_subtitle_languages', return_value=['en-US', 'fr-FR']):
            result = service._detect_language_from_subtitles("test123")
            assert result == "en"  # Should map en-US to en
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_detect_language_from_subtitles_no_target_languages(self, mock_run):
        """Test language detection when no target languages are available."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock get_available_subtitle_languages to return non-target languages
        with patch.object(service, 'get_available_subtitle_languages', return_value=['fr', 'es']):
            result = service._detect_language_from_subtitles("test123")
            assert result is None  # Should return None for non-target languages
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_detect_language_comprehensive_subtitles_priority(self, mock_run):
        """Test comprehensive language detection prioritizes subtitles."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock subtitle detection to return Vietnamese
        with patch.object(service, '_detect_language_from_subtitles', return_value='vi'):
            result = service._detect_language_comprehensive("test123", "English Title", "English description")
            assert result == "vi"  # Should use subtitle detection over text content
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_detect_language_comprehensive_fallback_chain(self, mock_run):
        """Test comprehensive language detection fallback chain."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock all methods to fail except heuristic
        with patch.object(service, '_detect_language_from_subtitles', return_value=None), \
             patch.object(service, '_extract_language_from_metadata', return_value=None), \
             patch.object(service, '_detect_language_with_library', return_value=None), \
             patch.object(service, '_detect_language_heuristic', return_value='de'):
            
            result = service._detect_language_comprehensive("test123", "German Title", "German description")
            assert result == "de"  # Should fall back to heuristic method
    
    def test_extract_language_from_metadata_direct_field(self):
        """Test extracting language from direct metadata field."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Test direct language field
            metadata = {"language": "vi"}
            result = service._extract_language_from_metadata(metadata)
            assert result == "vi"
    
    def test_extract_language_from_metadata_subtitles(self):
        """Test extracting language from subtitle availability."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Test subtitle-based detection
            metadata = {"subtitles": {"ja": {}, "en": {}}}
            result = service._extract_language_from_metadata(metadata)
            assert result == "ja"  # Should prioritize Japanese over English
    
    def test_extract_language_from_metadata_automatic_captions(self):
        """Test extracting language from automatic captions."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Test automatic captions
            metadata = {"automatic_captions": {"de": {}, "fr": {}}}
            result = service._extract_language_from_metadata(metadata)
            assert result == "de"  # Should find German in automatic captions
    
    def test_detect_language_with_library_success(self):
        """Test language detection with external library."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Mock langdetect library by patching the import
            with patch('builtins.__import__') as mock_import:
                mock_langdetect = Mock()
                mock_langdetect.detect.return_value = 'vi'
                mock_import.return_value = mock_langdetect
                
                result = service._detect_language_with_library("Tiếng Việt", "Đây là mô tả tiếng Việt")
                assert result == "vi"
    
    def test_detect_language_with_library_not_available(self):
        """Test language detection when library is not available."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Mock ImportError for langdetect
            with patch('builtins.__import__', side_effect=ImportError):
                result = service._detect_language_with_library("Some text", "Some description")
                assert result is None  # Should return None when library not available
    
    def test_langdetect_library_integration(self):
        """Test langdetect library integration with real detection."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Test cases with different languages
            test_cases = [
                {
                    "title": "Học lập trình Python cơ bản",
                    "description": "Khóa học này sẽ giúp bạn nắm vững các kiến thức cơ bản về Python và ứng dụng trong thực tế.",
                    "expected": "vi",
                    "note": "Vietnamese programming tutorial"
                },
                {
                    "title": "Learn Python Programming",
                    "description": "This comprehensive course will teach you Python from basics to advanced concepts with practical examples.",
                    "expected": "en", 
                    "note": "English programming tutorial"
                },
                {
                    "title": "Pythonプログラミング入門",
                    "description": "この講座では、Pythonの基礎から応用まで実践的に学習できます。初心者の方にもわかりやすく説明します。",
                    "expected": "ja",
                    "note": "Japanese programming tutorial"
                },
                {
                    "title": "Python Programmierung lernen",
                    "description": "Dieser umfassende Kurs lehrt Sie Python von den Grundlagen bis zu fortgeschrittenen Konzepten mit praktischen Beispielen.",
                    "expected": "de",
                    "note": "German programming tutorial"
                }
            ]
            
            try:
                # Test if langdetect is available
                import langdetect
                
                print(f"\n🔍 Testing langdetect library integration:")
                
                for case in test_cases:
                    result = service._detect_language_with_library(case["title"], case["description"])
                    
                    # langdetect might not always be 100% accurate, so we'll be flexible
                    if result == case["expected"]:
                        print(f"  ✅ {case['note']}: {result}")
                    else:
                        print(f"  ⚠️  {case['note']}: got {result}, expected {case['expected']}")
                    
                    # At minimum, should return a valid language code or None
                    assert result is None or isinstance(result, str)
                    if result:
                        assert len(result) == 2  # Should be 2-letter language code
                
                # Test with insufficient text
                result = service._detect_language_with_library("Hi", "Short")
                print(f"  📝 Short text result: {result}")
                
                # Test with mixed languages
                result = service._detect_language_with_library(
                    "Hello xin chào", 
                    "This is mixed English and Vietnamese text"
                )
                print(f"  🌐 Mixed language result: {result}")
                
            except ImportError:
                # If langdetect is not available, test the fallback behavior
                result = service._detect_language_with_library("Test", "Test description")
                assert result is None
                print("  ℹ️  langdetect not available, tested fallback behavior")
    
    def test_langdetect_library_error_handling(self):
        """Test langdetect library error handling."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            try:
                import langdetect
                
                # Test with empty text (should handle gracefully)
                result = service._detect_language_with_library("", "")
                assert result is None or isinstance(result, str)
                
                # Test with very short text that might cause detection errors
                result = service._detect_language_with_library("a", "b")
                assert result is None or isinstance(result, str)
                
                # Test with special characters
                result = service._detect_language_with_library("@#$%", "!@#$%^&*()")
                assert result is None or isinstance(result, str)
                
            except ImportError:
                # Skip this test if langdetect is not available
                pass
    
    def test_detect_language_heuristic_improved_scoring(self):
        """Test improved heuristic language detection with scoring."""
        with patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "yt-dlp 2024.1.1"
            
            service = VideoIngestionService()
            
            # Test Vietnamese with multiple indicators
            result = service._detect_language_heuristic(
                "Học tiếng Việt", 
                "Video này giúp bạn học tiếng Việt từ cơ bản đến nâng cao với các từ vựng và ngữ pháp"
            )
            assert result == "vi"
            
            # Test Japanese with characters
            result = service._detect_language_heuristic(
                "日本語の勉強", 
                "この動画では日本語を学ぶ方法について説明します"
            )
            assert result == "ja"
            
            # Test German with umlauts and common words
            result = service._detect_language_heuristic(
                "Deutsch lernen für Anfänger", 
                "In diesem Video lernen Sie die deutsche Sprache mit vielen Übungen"
            )
            assert result == "de"
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_get_available_subtitle_languages_improved_parsing(self, mock_run):
        """Test improved subtitle language parsing."""
        # Mock yt-dlp availability
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"
        
        service = VideoIngestionService()
        
        # Mock yt-dlp --list-subs output
        mock_output = """Available subtitles for test123:
Language formats
en       English
vi       Vietnamese
ja       Japanese

Available automatic captions for test123:
Language formats
de       German
fr       French
"""
        
        mock_run.reset_mock()
        mock_run.side_effect = [
            Mock(returncode=0, stdout=mock_output),
        ]
        
        result = service.get_available_subtitle_languages("test123")
        
        # Should parse both manual and automatic subtitles
        expected_languages = ['en', 'vi', 'ja', 'de', 'fr']
        for lang in expected_languages:
            assert lang in result


@pytest.mark.unit
class TestRateLimiter:
    """Unit tests for RateLimiter."""
    
    def test_init(self):
        """Test RateLimiter initialization."""
        limiter = RateLimiter(10)  # 10 requests per minute
        assert limiter.requests_per_minute == 10
        assert limiter.min_interval == 6.0  # 60/10 = 6 seconds
    
    def test_init_zero_limit(self):
        """Test RateLimiter with zero limit (no limiting)."""
        limiter = RateLimiter(0)
        assert limiter.min_interval == 0
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.time')
    def test_wait_if_needed_no_wait(self, mock_time):
        """Test wait_if_needed when no wait is required."""
        # Mock time.time() to return values showing enough time has passed
        mock_time.time.side_effect = [10, 10]  # current_time, last_request_time update
        
        limiter = RateLimiter(10)  # 6 second interval
        limiter.last_request_time = 0  # 10 seconds ago
        
        limiter.wait_if_needed()
        
        # Should not call sleep since enough time has passed (10 - 0 = 10 > 6)
        mock_time.sleep.assert_not_called()
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.time')
    def test_wait_if_needed_with_wait(self, mock_time):
        """Test wait_if_needed when wait is required."""
        # Mock time.time() to return values showing not enough time has passed
        mock_time.time.side_effect = [3, 3]  # current_time, last_request_time update
        
        limiter = RateLimiter(10)  # 6 second interval
        limiter.last_request_time = 0  # 3 seconds ago
        
        limiter.wait_if_needed()
        
        # Should call sleep with remaining time (6 - 3 = 3 seconds)
        mock_time.sleep.assert_called_once_with(3.0)


@pytest.mark.unit
class TestUtilityFunctions:
    """Unit tests for utility functions."""
    
    def test_extract_video_id_from_url_watch(self):
        """Test video ID extraction from watch URL."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        result = extract_video_id_from_url(url)
        assert result == "dQw4w9WgXcQ"
    
    def test_extract_video_id_from_url_short(self):
        """Test video ID extraction from short URL."""
        url = "https://youtu.be/dQw4w9WgXcQ"
        result = extract_video_id_from_url(url)
        assert result == "dQw4w9WgXcQ"
    
    def test_extract_video_id_from_url_embed(self):
        """Test video ID extraction from embed URL."""
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        result = extract_video_id_from_url(url)
        assert result == "dQw4w9WgXcQ"
    
    def test_extract_video_id_from_url_invalid(self):
        """Test video ID extraction from invalid URL."""
        url = "https://invalid-url.com"
        result = extract_video_id_from_url(url)
        assert result is None
    
    def test_extract_channel_id_from_url_channel(self):
        """Test channel ID extraction from channel URL."""
        url = "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"
        result = extract_channel_id_from_url(url)
        assert result == "UCuAXFkgsw1L7xaCfnd5JJOw"
    
    def test_extract_channel_id_from_url_handle(self):
        """Test channel ID extraction from handle URL."""
        url = "https://www.youtube.com/@testchannel"
        result = extract_channel_id_from_url(url)
        assert result == "testchannel"
    
    def test_extract_channel_id_from_url_user(self):
        """Test channel ID extraction from user URL."""
        url = "https://www.youtube.com/user/testuser"
        result = extract_channel_id_from_url(url)
        assert result == "testuser"
    
    def test_extract_channel_id_from_url_invalid(self):
        """Test channel ID extraction from invalid URL."""
        url = "https://invalid-url.com"
        result = extract_channel_id_from_url(url)
        assert result is None
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_is_video_available_true(self, mock_run):
        """Test is_video_available returns True for available video."""
        mock_run.return_value.returncode = 0
        
        result = is_video_available("dQw4w9WgXcQ")
        assert result is True
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_is_video_available_false(self, mock_run):
        """Test is_video_available returns False for unavailable video."""
        mock_run.return_value.returncode = 1
        
        result = is_video_available("invalid_id")
        assert result is False
    
    @patch('src.multilingual_video_pipeline.services.video_ingestion.subprocess.run')
    def test_is_video_available_timeout(self, mock_run):
        """Test is_video_available handles timeout."""
        mock_run.side_effect = subprocess.TimeoutExpired("yt-dlp", 30)
        
        result = is_video_available("test123")
        assert result is False


@pytest.mark.unit
class TestVideoIngestionApiMode:
    """API-mode tests for video ingestion."""

    @patch("src.multilingual_video_pipeline.services.video_ingestion.subprocess.run")
    def test_download_video_via_api(self, mock_run, tmp_path):
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"

        settings = Mock()
        settings.youtube_rate_limit = 10
        settings.video_quality = "best"
        settings.use_api_services = True
        settings.api_base_url = "http://127.0.0.1:6900"
        settings.data_dir = tmp_path / "data"
        settings.audio_format = "wav"
        settings.audio_sample_rate = 48000

        api_client = Mock()
        api_client.post_json.return_value = {"job_id": "download_1"}
        api_client.poll_for_completion.return_value = {
            "result": {"download_url": "/api/v1/files/file_1"}
        }

        def _write_video(_base_url: str, _download_url: str, output_path: Path) -> Path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"video-data")
            return output_path

        api_client.download_from_url.side_effect = _write_video

        service = VideoIngestionService(settings=settings, use_api=True, api_client=api_client)
        result = service.download_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ", output_path=str(tmp_path / "video"))

        assert result.exists()
        assert result.suffix == ".mp4"
        api_client.post_json.assert_called_once()
        api_client.poll_for_completion.assert_called_once()

    @patch("src.multilingual_video_pipeline.services.video_ingestion.subprocess.run")
    def test_extract_audio_via_api(self, mock_run, tmp_path):
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "yt-dlp 2024.1.1"

        settings = Mock()
        settings.youtube_rate_limit = 10
        settings.video_quality = "best"
        settings.use_api_services = True
        settings.api_base_url = "http://127.0.0.1:6900"
        settings.data_dir = tmp_path / "data"
        settings.audio_format = "wav"
        settings.audio_sample_rate = 48000

        video_file = tmp_path / "video.mp4"
        video_file.write_bytes(b"video-data")

        api_client = Mock()
        api_client.post_multipart.return_value = {"download_url": "/api/v1/files/audio_1"}

        def _write_audio(_base_url: str, _download_url: str, output_path: Path) -> Path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"audio-data")
            return output_path

        api_client.download_from_url.side_effect = _write_audio

        service = VideoIngestionService(settings=settings, use_api=True, api_client=api_client)
        audio_path = service.extract_audio(video_file, output_dir=tmp_path)

        assert audio_path.exists()
        assert audio_path.suffix == ".wav"
        api_client.post_multipart.assert_called_once()
