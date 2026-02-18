"""
Video Ingestion Service for downloading and processing YouTube videos.
"""

import os
import re
import time
import subprocess
import json
from urllib.parse import parse_qs, urlparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any, Union

from ..models import VideoMetadata
from ..config import get_settings
from ..logging_config import LoggerMixin
from ..utils.file_utils import ensure_directory, safe_filename, get_file_size
from ..utils.validation import validate_youtube_url
from .api_client import ApiClient


class VideoIngestionError(Exception):
    """Exception raised during video ingestion."""
    pass


class VideoIngestionService(LoggerMixin):
    """
    Service for ingesting videos and metadata.
    
    Download and audio extraction are API-only in the migrated pipeline.
    Metadata/subtitle helpers remain local where no API equivalent exists.
    """
    
    def __init__(self, settings=None, use_api: bool = True, api_client: Optional[ApiClient] = None):
        """
        Initialize the Video Ingestion Service.
        
        Args:
            settings: Optional settings override
            use_api: API mode switch. This service is API-only for download/audio stages.
            api_client: Shared API client instance
        """
        self.settings = settings or get_settings()
        self.use_api = bool(use_api and getattr(self.settings, "use_api_services", True))
        if not self.use_api:
            raise VideoIngestionError(
                "VideoIngestionService is API-only for download/audio. Enable settings.use_api_services and pass use_api=True."
            )
        self.api_client = api_client or ApiClient(self.settings)
        self._rate_limiter = RateLimiter(self.settings.youtube_rate_limit)
        
        # Check if yt-dlp is available
        self._check_ytdlp_availability()
        
        self.logger.info(
            "Video Ingestion Service initialized",
            rate_limit=self.settings.youtube_rate_limit,
            video_quality=self.settings.video_quality,
            use_api=self.use_api,
        )
    
    def _check_ytdlp_availability(self):
        """Check if yt-dlp is available in the system."""
        try:
            result = subprocess.run(['yt-dlp', '--version'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                self.logger.info("yt-dlp found", version=result.stdout.strip())
                self._ytdlp_available = True
            else:
                self._ytdlp_available = False
        except (subprocess.TimeoutExpired, FileNotFoundError):
            self._ytdlp_available = False
        
        if not self._ytdlp_available:
            self.logger.warning("yt-dlp not found. Please install with: pip install yt-dlp")
    
    def fetch_channel_videos(
        self, 
        channel_url: str, 
        since: Optional[datetime] = None, 
        limit: Optional[int] = None
    ) -> List[VideoMetadata]:
        """
        Fetch videos from a YouTube channel with optional filtering.
        
        Args:
            channel_url: YouTube channel URL
            since: Optional datetime to filter videos uploaded after this date
            limit: Optional maximum number of videos to fetch
            
        Returns:
            List of VideoMetadata objects
            
        Raises:
            VideoIngestionError: If channel cannot be accessed or processed
        """
        if not self._ytdlp_available:
            raise VideoIngestionError("yt-dlp is not available. Please install with: pip install yt-dlp")
        
        if not validate_youtube_url(channel_url):
            raise VideoIngestionError(f"Invalid YouTube URL: {channel_url}")
        
        self.logger.info("Fetching channel videos", 
                        channel_url=channel_url, 
                        since=since.isoformat() if since else None,
                        limit=limit)
        
        try:
            # Apply rate limiting
            self._rate_limiter.wait_if_needed()
            
            # Build yt-dlp command for channel extraction
            cmd = [
                'yt-dlp',
                '--extract-flat',
                '--dump-json',
                '--no-warnings',
                channel_url
            ]
            
            if limit:
                cmd.extend(['--playlist-end', str(limit)])
            
            # Execute yt-dlp command
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                raise VideoIngestionError(f"yt-dlp failed: {result.stderr}")
            
            # Parse JSON output
            videos = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue
                
                try:
                    entry = json.loads(line)
                    video_id = entry.get('id')
                    
                    if not video_id:
                        continue
                    
                    # Get detailed video information
                    video_metadata = self._extract_video_metadata_subprocess(video_id)
                    
                    # Apply date filtering if specified
                    if since and video_metadata.upload_date < since:
                        self.logger.debug("Skipping video older than filter date",
                                        video_id=video_id,
                                        upload_date=video_metadata.upload_date.isoformat())
                        continue
                    
                    videos.append(video_metadata)
                    
                    # Apply rate limiting between video extractions
                    self._rate_limiter.wait_if_needed()
                    
                except (json.JSONDecodeError, Exception) as e:
                    self.logger.warning("Failed to parse video entry",
                                      error=str(e),
                                      line=line[:100])
                    continue
            
            self.logger.info("Channel videos fetched successfully",
                           channel_url=channel_url,
                           videos_found=len(videos))
            
            return videos
            
        except subprocess.TimeoutExpired:
            raise VideoIngestionError("Channel extraction timed out")
        except Exception as e:
            if isinstance(e, VideoIngestionError):
                raise
            raise VideoIngestionError(f"Unexpected error fetching channel videos: {str(e)}")
    
    def download_video(self, video_id: str, output_path: Optional[str] = None) -> Path:
        """
        Download a video by ID or URL.
        
        Args:
            video_id: YouTube video ID or full URL
            output_path: Optional custom output path
            
        Returns:
            Path to the downloaded video file
        """
        video_url = self._to_video_url(video_id)
        resolved_video_id = extract_video_id_from_url(video_url) or video_id

        return self._download_via_api(resolved_video_id, video_url, output_path)

    def _download_via_api(self, video_id: str, video_url: str, output_path: Optional[str]) -> Path:
        """Download video through app-and-basic-tool API."""
        payload = {
            "url": video_url,
            "platform": "youtube",
            "convert_to_h264": True,
        }
        response = self.api_client.post_json(self.settings.api_base_url, "/api/v1/video/download", payload)
        job_id = response.get("job_id")
        if not isinstance(job_id, str) or not job_id:
            raise VideoIngestionError("Invalid API response: missing job_id")

        status = self.api_client.poll_for_completion(
            base_url=self.settings.api_base_url,
            task_id=job_id,
            stream_path="/api/v1/video/download/stream",
            result_path="/api/v1/video/download/status",
        )
        result = status.get("result")
        if not isinstance(result, dict):
            raise VideoIngestionError("Invalid API download status payload")

        download_url = result.get("download_url")
        if not isinstance(download_url, str) or not download_url:
            raise VideoIngestionError("Video download URL missing in API status")

        if output_path:
            output_file = Path(output_path)
            if output_file.suffix.lower() != ".mp4":
                output_file = output_file.with_suffix(".mp4")
        else:
            output_dir = ensure_directory(self.settings.data_dir / "videos")
            output_file = output_dir / f"{video_id}.mp4"

        self.api_client.download_from_url(self.settings.api_base_url, download_url, output_file)
        if not output_file.exists():
            raise VideoIngestionError(f"Downloaded video file not found: {output_file}")

        self.logger.info(
            "Video downloaded via API",
            video_id=video_id,
            file_path=str(output_file),
            file_size_mb=get_file_size(output_file) / (1024 * 1024),
        )
        return output_file

    def extract_metadata(self, video_id: str) -> VideoMetadata:
        """
        Extract metadata for a specific video without downloading.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            VideoMetadata object
            
        Raises:
            VideoIngestionError: If metadata cannot be extracted
        """
        if not self._ytdlp_available:
            raise VideoIngestionError("yt-dlp is not available. Please install with: pip install yt-dlp")
        
        self.logger.info("Extracting video metadata", video_id=video_id)
        
        try:
            return self._extract_video_metadata_subprocess(video_id)
            
        except Exception as e:
            if isinstance(e, VideoIngestionError):
                raise
            raise VideoIngestionError(f"Unexpected error extracting metadata for {video_id}: {str(e)}")
    
    def save_metadata(self, metadata: VideoMetadata, output_dir: Path) -> Path:
        """
        Save video metadata to a JSON file.
        
        Args:
            metadata: VideoMetadata object to save
            output_dir: Directory where metadata file will be saved
            
        Returns:
            Path to the saved metadata file
            
        Raises:
            VideoIngestionError: If metadata cannot be saved
        """
        try:
            output_dir = ensure_directory(output_dir)
            metadata_path = output_dir / "metadata.json"
            
            # Convert metadata to dict
            metadata_dict = metadata.to_dict() if hasattr(metadata, 'to_dict') else {
                'title': str(getattr(metadata, 'title', 'Unknown')),
                'duration': int(getattr(metadata, 'duration', 0)),
                'description': str(getattr(metadata, 'description', '')),
                'upload_date': str(getattr(metadata, 'upload_date', '')),
                'uploader': str(getattr(metadata, 'uploader', '')),
                'view_count': int(getattr(metadata, 'view_count', 0)) if hasattr(metadata, 'view_count') else 0,
                'thumbnail_url': str(getattr(metadata, 'thumbnail_url', '')),
            }
            
            # Write to file
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata_dict, f, indent=2)
            
            self.logger.info("Metadata saved", path=str(metadata_path))
            return metadata_path
            
        except Exception as e:
            raise VideoIngestionError(f"Failed to save metadata: {str(e)}")
    
    def extract_audio(self, video_file: Path, output_dir: Optional[Path] = None) -> Path:
        """
        Extract audio track from a video file.
        
        Args:
            video_file: Path to the video file
            output_dir: Optional custom output directory (defaults to settings.data_dir / 'audio')
            
        Returns:
            Path to the extracted audio file
            
        Raises:
            VideoIngestionError: If audio cannot be extracted
        """
        self.logger.info("Extracting audio from video", video_file=str(video_file), output_dir=str(output_dir))

        return self._extract_audio_via_api(video_file, output_dir)

    def _extract_audio_via_api(self, video_file: Path, output_dir: Optional[Path] = None) -> Path:
        """Extract audio via app-and-basic-tool API."""
        if not video_file.exists():
            raise VideoIngestionError(f"Video file not found: {video_file}")

        if output_dir:
            audio_dir = ensure_directory(output_dir)
        else:
            audio_dir = ensure_directory(self.settings.data_dir / "audio")
        audio_file = audio_dir / f"{video_file.stem}.{self.settings.audio_format}"

        with video_file.open("rb") as stream:
            response = self.api_client.post_multipart(
                self.settings.api_base_url,
                "/api/v1/video/extract-audio",
                data={"format": self.settings.audio_format},
                files={"file": (video_file.name, stream, "video/mp4")},
            )

        download_url = response.get("download_url")
        if not isinstance(download_url, str) or not download_url:
            raise VideoIngestionError("Invalid extract-audio response: missing download_url")

        self.api_client.download_from_url(self.settings.api_base_url, download_url, audio_file)
        if not audio_file.exists():
            raise VideoIngestionError(f"Extracted audio file not found: {audio_file}")

        self.logger.info(
            "Audio extracted via API",
            video_file=str(video_file),
            audio_file=str(audio_file),
            file_size_mb=get_file_size(audio_file) / (1024 * 1024),
        )
        return audio_file

    def extract_subtitles(self, video_id: str, languages: Optional[List[str]] = None, format: str = "srt") -> Dict[str, Path]:
        """
        Extract subtitles/captions from a YouTube video using improved yt-dlp options.
        
        Args:
            video_id: YouTube video ID
            languages: Optional list of language codes to extract (e.g., ['en', 'vi', 'ja'])
                      If None, extracts all available languages
            format: Subtitle format ('srt', 'vtt', 'ass', etc.)
            
        Returns:
            Dictionary mapping language codes to subtitle file paths
            
        Raises:
            VideoIngestionError: If subtitles cannot be extracted
        """
        if not self._ytdlp_available:
            raise VideoIngestionError("yt-dlp is not available. Please install with: pip install yt-dlp")
        
        self.logger.info("Extracting subtitles", 
                        video_id=video_id, 
                        languages=languages,
                        format=format)
        
        try:
            # Apply rate limiting
            self._rate_limiter.wait_if_needed()
            
            # Determine output directory
            subtitles_dir = ensure_directory(self.settings.data_dir / 'subtitles')
            
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            # Build yt-dlp command for subtitle extraction
            cmd = [
                'yt-dlp',
                '--write-subs',           # Write subtitle files
                '--write-auto-subs',      # Write automatically generated subtitles
                '--sub-format', format,   # Subtitle format (srt, vtt, etc.)
                '--skip-download',        # Don't download the video, just subtitles
                '--output', str(subtitles_dir / f'{video_id}.%(ext)s'),
                '--no-warnings',
                video_url
            ]
            
            # Add language filter if specified
            if languages:
                cmd.extend(['--sub-langs', ','.join(languages)])
            else:
                # If no specific languages requested, download all available
                cmd.append('--all-subs')
            
            # Execute subtitle extraction
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)  # 5 min timeout
            
            if result.returncode != 0:
                # Don't raise error if no subtitles found, just log warning
                self.logger.warning("No subtitles found or extraction failed",
                                  video_id=video_id,
                                  stderr=result.stderr)
                return {}
            
            # Find extracted subtitle files
            subtitle_files = {}
            
            # Look for subtitle files in the output directory
            for subtitle_file in subtitles_dir.glob(f"{video_id}*.{format}"):
                # Extract language code from filename
                # Format is usually: video_id.lang.srt or video_id.lang.auto.srt
                filename_parts = subtitle_file.stem.split('.')
                if len(filename_parts) >= 2:
                    lang_code = filename_parts[1]
                    subtitle_files[lang_code] = subtitle_file
                    
                    self.logger.debug("Subtitle file found",
                                    video_id=video_id,
                                    language=lang_code,
                                    file_path=str(subtitle_file))
            
            if subtitle_files:
                self.logger.info("Subtitles extracted successfully",
                               video_id=video_id,
                               languages=list(subtitle_files.keys()),
                               format=format)
            else:
                self.logger.warning("No subtitle files found after extraction",
                                  video_id=video_id)
            
            return subtitle_files
            
        except subprocess.TimeoutExpired:
            raise VideoIngestionError("Subtitle extraction timed out")
        except Exception as e:
            if isinstance(e, VideoIngestionError):
                raise
            raise VideoIngestionError(f"Unexpected error extracting subtitles: {str(e)}")
    
    def extract_all_subtitles(self, video_id: str, format: str = "srt") -> Dict[str, Path]:
        """
        Extract all available subtitles for a video using --all-subs.
        
        Args:
            video_id: YouTube video ID
            format: Subtitle format ('srt', 'vtt', 'ass', etc.)
            
        Returns:
            Dictionary mapping language codes to subtitle file paths
        """
        return self.extract_subtitles(video_id, languages=None, format=format)
    
    def extract_target_language_subtitles(self, video_id: str, format: str = "srt") -> Dict[str, Path]:
        """
        Extract subtitles only for our target languages (vi, ja, de, en).
        
        Args:
            video_id: YouTube video ID
            format: Subtitle format ('srt', 'vtt', 'ass', etc.)
            
        Returns:
            Dictionary mapping language codes to subtitle file paths
        """
        target_languages = ['vi', 'ja', 'de', 'en']
        return self.extract_subtitles(video_id, languages=target_languages, format=format)
    
    def convert_subtitles_to_srt(self, vtt_file: Path) -> Path:
        """
        Convert VTT subtitle file to SRT format.
        
        Args:
            vtt_file: Path to the VTT subtitle file
            
        Returns:
            Path to the converted SRT file
            
        Raises:
            VideoIngestionError: If conversion fails
        """
        if not vtt_file.exists():
            raise VideoIngestionError(f"VTT file not found: {vtt_file}")
        
        srt_file = vtt_file.with_suffix('.srt')
        
        try:
            # Simple VTT to SRT conversion
            with open(vtt_file, 'r', encoding='utf-8') as f:
                vtt_content = f.read()
            
            # Convert VTT format to SRT format
            srt_content = self._convert_vtt_to_srt(vtt_content)
            
            with open(srt_file, 'w', encoding='utf-8') as f:
                f.write(srt_content)
            
            self.logger.info("Subtitle converted to SRT",
                           vtt_file=str(vtt_file),
                           srt_file=str(srt_file))
            
            return srt_file
            
        except Exception as e:
            raise VideoIngestionError(f"Failed to convert VTT to SRT: {str(e)}")
    
    def get_available_subtitle_languages(self, video_id: str) -> List[str]:
        """
        Get list of available subtitle languages for a video.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            List of available language codes
            
        Raises:
            VideoIngestionError: If language list cannot be retrieved
        """
        if not self._ytdlp_available:
            raise VideoIngestionError("yt-dlp is not available. Please install with: pip install yt-dlp")
        
        try:
            # Apply rate limiting
            self._rate_limiter.wait_if_needed()
            
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            # Build yt-dlp command to list subtitles
            cmd = [
                'yt-dlp',
                '--list-subs',
                '--no-warnings',
                video_url
            ]
            
            # Execute command
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                raise VideoIngestionError(f"Failed to list subtitles for {video_id}: {result.stderr}")
            
            # Parse output to extract language codes
            languages = []
            lines = result.stdout.split('\n')
            
            for line in lines:
                # Look for lines that contain language codes
                # Format is usually: "en    English"
                if re.match(r'^[a-z]{2,3}\s+', line.strip()):
                    lang_code = line.strip().split()[0]
                    languages.append(lang_code)
            
            self.logger.debug("Available subtitle languages found",
                            video_id=video_id,
                            languages=languages)
            
            return languages
            
        except subprocess.TimeoutExpired:
            raise VideoIngestionError("Subtitle language listing timed out")
        except Exception as e:
            if isinstance(e, VideoIngestionError):
                raise
            raise VideoIngestionError(f"Unexpected error listing subtitle languages: {str(e)}")
    
    def _convert_vtt_to_srt(self, vtt_content: str) -> str:
        """
        Convert VTT subtitle content to SRT format.
        
        Args:
            vtt_content: VTT file content
            
        Returns:
            SRT formatted content
        """
        lines = vtt_content.split('\n')
        srt_lines = []
        subtitle_count = 0
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip VTT header and empty lines
            if line.startswith('WEBVTT') or line.startswith('NOTE') or not line:
                i += 1
                continue
            
            # Check if this is a timestamp line
            if '-->' in line:
                subtitle_count += 1
                
                # Convert VTT timestamp format to SRT format
                # VTT: 00:00:01.000 --> 00:00:04.000
                # SRT: 00:00:01,000 --> 00:00:04,000
                timestamp_line = line.replace('.', ',')
                
                srt_lines.append(str(subtitle_count))
                srt_lines.append(timestamp_line)
                
                # Get subtitle text (next non-empty lines)
                i += 1
                subtitle_text = []
                while i < len(lines) and lines[i].strip():
                    subtitle_text.append(lines[i].strip())
                    i += 1
                
                srt_lines.extend(subtitle_text)
                srt_lines.append('')  # Empty line between subtitles
            else:
                i += 1
        
        return '\n'.join(srt_lines)
    
    def _extract_video_metadata_subprocess(self, video_id: str) -> VideoMetadata:
        """
        Extract detailed metadata for a video using subprocess.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            VideoMetadata object
        """
        # Apply rate limiting
        self._rate_limiter.wait_if_needed()
        
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Build yt-dlp command for metadata extraction
        cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-warnings',
            video_url
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                raise VideoIngestionError(f"Failed to extract video metadata for {video_id}: {result.stderr}")
            
            # Parse JSON output
            info = json.loads(result.stdout)
            
            # Extract upload date
            upload_date_str = info.get('upload_date')
            if upload_date_str:
                upload_date = datetime.strptime(upload_date_str, '%Y%m%d')
            else:
                upload_date = datetime.now()  # Fallback to current date
            
            # Extract duration
            duration = info.get('duration', 0)
            if duration is None:
                duration = 0
            
            # Extract tags
            tags = info.get('tags', []) or []
            if isinstance(tags, str):
                tags = [tags]
            
            # Extract channel information
            channel_name = info.get('uploader', 'Unknown Channel')
            channel_url = info.get('uploader_url', '')
            
            # Extract language using improved multi-method approach
            title = info.get('title', '')
            description = info.get('description', '')
            original_language = self._detect_language_comprehensive(video_id, title, description)
            
            metadata = VideoMetadata(
                video_id=video_id,
                title=title,
                description=description or '',
                duration=float(duration),
                upload_date=upload_date,
                channel_name=channel_name,
                channel_url=channel_url,
                original_language=original_language,
                tags=tags[:20],  # Limit to 20 tags
            )
            
            self.logger.debug("Video metadata extracted",
                            video_id=video_id,
                            title=metadata.title,
                            duration=metadata.duration,
                            upload_date=metadata.upload_date.isoformat())
            
            return metadata
            
        except subprocess.TimeoutExpired:
            raise VideoIngestionError(f"Metadata extraction timed out for video {video_id}")
        except json.JSONDecodeError as e:
            raise VideoIngestionError(f"Failed to parse video metadata JSON for {video_id}: {str(e)}")
    
    def _find_downloaded_file(self, video_id: str, output_path: Optional[str] = None) -> Optional[Path]:
        """
        Find the downloaded video file.
        
        Args:
            video_id: YouTube video ID
            output_path: Optional custom output path
            
        Returns:
            Path to the downloaded file or None if not found
        """
        if output_path:
            search_dir = Path(output_path).parent
        else:
            search_dir = self.settings.data_dir / 'videos'
        
        # Common video extensions
        extensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov']
        
        for ext in extensions:
            file_path = search_dir / f"{video_id}{ext}"
            if file_path.exists():
                return file_path
        
        # If not found with exact ID, search for files containing the ID
        if search_dir.exists():
            for file_path in search_dir.glob(f"*{video_id}*"):
                if file_path.is_file() and file_path.suffix.lower() in extensions:
                    return file_path
        
        return None

    @staticmethod
    def _to_video_url(video_id_or_url: str) -> str:
        """Normalize input into a full YouTube video URL."""
        parsed = urlparse(video_id_or_url)
        if parsed.scheme and parsed.netloc:
            if "youtu.be" in parsed.netloc and parsed.path:
                return f"https://www.youtube.com/watch?v={parsed.path.lstrip('/')}"
            if "youtube.com" in parsed.netloc:
                query_id = parse_qs(parsed.query).get("v", [None])[0]
                if query_id:
                    return f"https://www.youtube.com/watch?v={query_id}"
                if "/watch" in parsed.path:
                    return video_id_or_url
            return video_id_or_url
        return f"https://www.youtube.com/watch?v={video_id_or_url}"
    
    def _extract_language_from_metadata(self, info: dict) -> Optional[str]:
        """
        Extract language from YouTube metadata.
        
        Args:
            info: Video metadata from yt-dlp
            
        Returns:
            Language code or None if not found
        """
        # Try different metadata fields that might contain language info
        language_fields = [
            'language',           # Direct language field
            'default_language',   # Default language
            'audio_language',     # Audio language
            'subtitles_language', # Subtitle language
        ]
        
        for field in language_fields:
            lang = info.get(field)
            if lang and isinstance(lang, str) and len(lang) >= 2:
                # Normalize language code
                lang_code = lang.lower()[:2]
                if lang_code in ['vi', 'ja', 'de', 'en']:
                    self.logger.debug("Language detected from metadata",
                                    field=field, 
                                    language=lang_code)
                    return lang_code
        
        # Check available subtitles for language hints
        subtitles = info.get('subtitles', {})
        automatic_captions = info.get('automatic_captions', {})
        
        # Combine both subtitle sources
        all_subtitles = {**subtitles, **automatic_captions}
        
        if all_subtitles:
            # Get the most likely language based on available subtitles
            available_langs = list(all_subtitles.keys())
            
            # Prioritize our target languages
            for target_lang in ['vi', 'ja', 'de', 'en']:
                if target_lang in available_langs:
                    self.logger.debug("Language detected from subtitles",
                                    language=target_lang,
                                    available_subtitles=available_langs)
                    return target_lang
            
            # If no target language found, use the first available
            if available_langs:
                first_lang = available_langs[0][:2].lower()
                if first_lang in ['vi', 'ja', 'de', 'en']:
                    self.logger.debug("Language detected from first subtitle",
                                    language=first_lang,
                                    available_subtitles=available_langs)
                    return first_lang
        
        return None
    
    def _detect_language_heuristic(self, title: str, description: str) -> str:
        """
        Detect language using improved heuristics as fallback.
        
        Args:
            title: Video title
            description: Video description
            
        Returns:
            Language code (ISO 639-1)
        """
        text = f"{title} {description}".lower()
        
        # More comprehensive language indicators
        language_patterns = {
            'vi': [
                # Vietnamese specific characters and words
                'việt', 'tiếng việt', 'vietnam', 'vietnamese',
                'sài gòn', 'hà nội', 'tp hcm', 'đà nẵng',
                'của', 'và', 'với', 'trong', 'này', 'đó',
                'không', 'có', 'được', 'cho', 'từ', 'về',
                # Vietnamese diacritics pattern
                'ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'
            ],
            'ja': [
                # Japanese characters and words
                '日本', 'にほん', 'japanese', 'japan',
                'です', 'である', 'します', 'ます',
                'こんにちは', 'ありがとう', 'さようなら',
                # Hiragana/Katakana detection
                'の', 'に', 'は', 'を', 'が', 'で', 'と', 'から'
            ],
            'de': [
                # German specific words (avoid short common words)
                'deutsch', 'german', 'germany', 'deutschland',
                'und', 'der', 'die', 'das', 'ein', 'eine',
                'mit', 'für', 'auf', 'von', 'zu', 'im',
                'ist', 'sind', 'haben', 'werden', 'können',
                'ß', 'ä', 'ö', 'ü'  # German umlauts
            ]
        }
        
        # Score each language based on indicator frequency
        language_scores = {}
        
        for lang_code, indicators in language_patterns.items():
            score = 0
            for indicator in indicators:
                # Count occurrences, give more weight to longer indicators
                count = text.count(indicator)
                weight = len(indicator) if len(indicator) > 2 else 0.5
                score += count * weight
            
            if score > 0:
                language_scores[lang_code] = score
        
        # Return language with highest score, or English as default
        if language_scores:
            detected_lang = max(language_scores, key=language_scores.get)
            self.logger.debug("Language detected via heuristics",
                            language=detected_lang,
                            scores=language_scores)
            return detected_lang
        
        # Default to English if no patterns match
        return 'en'
    
    def _detect_language_comprehensive(self, video_id: str, title: str, description: str) -> str:
        """
        Comprehensive language detection using multiple methods in order of reliability:
        1. Subtitle language analysis (most reliable)
        2. YouTube metadata fields
        3. External language detection library (langdetect)
        4. Heuristic text analysis (fallback)
        
        Args:
            video_id: YouTube video ID
            title: Video title
            description: Video description
            
        Returns:
            Language code (ISO 639-1)
        """
        # Method 1: Detect from available subtitles (most reliable)
        try:
            lang = self._detect_language_from_subtitles(video_id)
            if lang:
                self.logger.info("Language detected from subtitles", 
                               video_id=video_id, 
                               language=lang, 
                               method="subtitles")
                return lang
        except Exception as e:
            self.logger.debug("Subtitle-based language detection failed", 
                            video_id=video_id, 
                            error=str(e))
        
        # Method 2: Extract from YouTube metadata
        try:
            # Get fresh metadata for language detection
            metadata_output = self._get_video_metadata_json(video_id)
            info = json.loads(metadata_output)
            
            lang = self._extract_language_from_metadata(info)
            if lang:
                self.logger.info("Language detected from metadata", 
                               video_id=video_id, 
                               language=lang, 
                               method="metadata")
                return lang
        except Exception as e:
            self.logger.debug("Metadata-based language detection failed", 
                            video_id=video_id, 
                            error=str(e))
        
        # Method 3: Use external language detection library
        try:
            lang = self._detect_language_with_library(title, description)
            if lang:
                self.logger.info("Language detected with library", 
                               video_id=video_id, 
                               language=lang, 
                               method="library")
                return lang
        except Exception as e:
            self.logger.debug("Library-based language detection failed", 
                            video_id=video_id, 
                            error=str(e))
        
        # Method 4: Fallback to heuristic analysis
        lang = self._detect_language_heuristic(title, description)
        self.logger.info("Language detected with heuristics", 
                       video_id=video_id, 
                       language=lang, 
                       method="heuristic")
        return lang
    
    def _detect_language_from_subtitles(self, video_id: str) -> Optional[str]:
        """
        Detect language by analyzing available subtitle languages.
        This is the most reliable method since subtitles reflect the actual spoken language.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Language code or None if detection fails
        """
        try:
            # Get available subtitle languages
            available_languages = self.get_available_subtitle_languages(video_id)
            
            if not available_languages:
                self.logger.debug("No subtitles available for language detection", 
                                video_id=video_id)
                return None
            
            self.logger.debug("Available subtitle languages", 
                            video_id=video_id, 
                            languages=available_languages)
            
            # Priority order for our target languages
            target_languages = ['vi', 'ja', 'de', 'en']
            
            # First, look for exact matches with our target languages
            for target_lang in target_languages:
                if target_lang in available_languages:
                    self.logger.debug("Found target language in subtitles", 
                                    video_id=video_id, 
                                    language=target_lang)
                    return target_lang
            
            # If no exact match, look for language variants (e.g., en-US, en-GB)
            for target_lang in target_languages:
                for available_lang in available_languages:
                    if available_lang.startswith(target_lang + '-') or available_lang.startswith(target_lang + '_'):
                        self.logger.debug("Found target language variant in subtitles", 
                                        video_id=video_id, 
                                        available=available_lang,
                                        mapped=target_lang)
                        return target_lang
            
            # If still no match, try to extract base language code from first available
            if available_languages:
                first_lang = available_languages[0]
                if len(first_lang) >= 2:
                    base_lang = first_lang[:2].lower()
                    if base_lang in target_languages:
                        self.logger.debug("Extracted base language from first subtitle", 
                                        video_id=video_id, 
                                        available=first_lang,
                                        extracted=base_lang)
                        return base_lang
            
            # No suitable language found
            self.logger.debug("No target languages found in subtitles", 
                            video_id=video_id, 
                            available=available_languages)
            return None
            
        except Exception as e:
            self.logger.debug("Error in subtitle-based language detection", 
                            video_id=video_id, 
                            error=str(e))
            return None
    
    def _get_video_metadata_json(self, video_id: str) -> str:
        """
        Get raw JSON metadata for a video.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Raw JSON string from yt-dlp
            
        Raises:
            VideoIngestionError: If metadata extraction fails
        """
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        
        cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-warnings',
            video_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            raise VideoIngestionError(f"Failed to extract video metadata for {video_id}: {result.stderr}")
        
        return result.stdout
    
    def _detect_language_with_library(self, title: str, description: str) -> Optional[str]:
        """
        Use external language detection library if available.
        
        Args:
            title: Video title
            description: Video description
            
        Returns:
            Language code or None if library not available
        """
        try:
            # Try to use langdetect library if available
            import langdetect
            
            # Combine title and description
            text = f"{title} {description}".strip()
            
            if len(text) < 10:  # Need sufficient text for reliable detection
                return None
            
            detected = langdetect.detect(text)
            
            # Map common language codes to our target languages
            language_mapping = {
                'vi': 'vi',
                'ja': 'ja', 
                'de': 'de',
                'en': 'en',
                'zh': 'en',  # Default Chinese to English for now
                'ko': 'en',  # Default Korean to English for now
                'fr': 'en',  # Default French to English for now
                'es': 'en',  # Default Spanish to English for now
            }
            
            mapped_lang = language_mapping.get(detected, 'en')
            
            self.logger.debug("Language detected with langdetect",
                            detected=detected,
                            mapped=mapped_lang,
                            text_length=len(text))
            
            return mapped_lang
            
        except ImportError:
            # langdetect not available, skip this method
            return None
        except Exception as e:
            self.logger.debug("Library-based language detection failed", 
                            error=str(e))
            return None


class RateLimiter:
    """Simple rate limiter for API calls."""
    
    def __init__(self, requests_per_minute: int):
        """
        Initialize rate limiter.
        
        Args:
            requests_per_minute: Maximum requests allowed per minute
        """
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute if requests_per_minute > 0 else 0
        self.last_request_time = 0.0
    
    def wait_if_needed(self):
        """Wait if necessary to respect rate limit."""
        if self.min_interval <= 0:
            return
        
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            sleep_time = self.min_interval - time_since_last
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()


# Utility functions for video URL handling

def extract_video_id_from_url(url: str) -> Optional[str]:
    """
    Extract video ID from various YouTube URL formats.
    
    Args:
        url: YouTube URL
        
    Returns:
        Video ID or None if not found
    """
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
        r'youtube\.com/v/([a-zA-Z0-9_-]{11})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    return None


def extract_channel_id_from_url(url: str) -> Optional[str]:
    """
    Extract channel ID from YouTube channel URL.
    
    Args:
        url: YouTube channel URL
        
    Returns:
        Channel ID or None if not found
    """
    patterns = [
        r'youtube\.com/channel/([a-zA-Z0-9_-]+)',
        r'youtube\.com/c/([a-zA-Z0-9_-]+)',
        r'youtube\.com/@([a-zA-Z0-9_-]+)',
        r'youtube\.com/user/([a-zA-Z0-9_-]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    return None


def is_video_available(video_id: str) -> bool:
    """
    Check if a video is available (not deleted, private, or restricted).
    
    Args:
        video_id: YouTube video ID
        
    Returns:
        True if video is available, False otherwise
    """
    try:
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        
        cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-warnings',
            video_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.returncode == 0
        
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
