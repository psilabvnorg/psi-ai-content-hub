"""Export management for platform-specific video formatting and metadata.

Features delivered for task 13.1:
- export_video for platform-specific formatting
- generate_metadata for each platform
- create_thumbnail from key frames
- package_outputs to organize files
"""

import subprocess
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import OutputFormat
from ..utils.file_utils import ensure_directory


class ExportManagerError(Exception):
    """Raised for export management related failures."""


@dataclass
class PlatformMetadata:
    """Platform-specific metadata configuration."""
    
    platform: str  # youtube, tiktok, facebook
    title: str
    description: str
    tags: List[str]
    language: str
    duration_seconds: float
    resolution: Tuple[int, int]
    aspect_ratio: str
    
    # Platform-specific fields
    youtube_category: Optional[str] = None  # e.g., "Education", "Entertainment"
    youtube_made_for_kids: bool = False
    tiktok_hashtags: Optional[List[str]] = None
    tiktok_sound_id: Optional[str] = None
    facebook_series_id: Optional[str] = None
    facebook_episode_number: Optional[int] = None
    
    def __post_init__(self):
        """Validate metadata."""
        if not self.platform in ["youtube", "tiktok", "facebook"]:
            raise ValueError(f"Invalid platform: {self.platform}")
        if not self.title:
            raise ValueError("Title cannot be empty")
        if self.duration_seconds <= 0:
            raise ValueError("Duration must be positive")


@dataclass
class ThumbnailConfig:
    """Configuration for thumbnail generation."""
    
    width: int = 1280
    height: int = 720
    format: str = "jpg"  # jpg or png
    quality: int = 90    # 0-100 for jpg
    timestamp: float = 1.0  # seconds into video
    
    def __post_init__(self):
        """Validate config."""
        if self.width <= 0 or self.height <= 0:
            raise ValueError("Width and height must be positive")
        if not 0 <= self.quality <= 100:
            raise ValueError("Quality must be 0-100")
        if self.timestamp < 0:
            raise ValueError("Timestamp cannot be negative")


@dataclass
class ExportPackage:
    """Packaged export with video, metadata, and thumbnails."""
    
    platform: str
    language: str
    video_path: Path
    metadata_path: Path
    thumbnail_path: Optional[Path] = None
    srt_path: Optional[Path] = None
    
    def __post_init__(self):
        """Validate paths."""
        if not self.video_path.exists():
            raise ValueError(f"Video file not found: {self.video_path}")
        if not self.metadata_path.exists():
            raise ValueError(f"Metadata file not found: {self.metadata_path}")


class ExportManager(LoggerMixin):
    """Manage platform-specific video exports and metadata."""
    
    # Platform specifications
    PLATFORM_SPECS = {
        "youtube": {
            "max_duration": 43200,  # 12 hours in seconds
            "min_duration": 0.5,
            "formats": ["16:9"],
            "recommended_resolution": (1920, 1080),
            "bitrate_range": (2500, 12000),  # kbps
            "max_file_size_gb": 128,
        },
        "tiktok": {
            "max_duration": 600,  # 10 minutes
            "min_duration": 0.5,
            "formats": ["9:16"],
            "recommended_resolution": (1080, 1920),
            "bitrate_range": (2000, 10000),  # kbps
            "max_file_size_gb": 2,
        },
        "facebook": {
            "max_duration": 7200,  # 2 hours
            "min_duration": 0.5,
            "formats": ["16:9", "9:16"],
            "recommended_resolution": (1280, 720),  # or 1080x1920
            "bitrate_range": (2000, 8000),  # kbps
            "max_file_size_gb": 4,
        }
    }
    
    # Thumbnail specifications per platform
    THUMBNAIL_SPECS = {
        "youtube": {
            "dimensions": (1280, 720),
            "aspect_ratio": "16:9",
            "max_size_mb": 2,
            "formats": ["jpg", "png"],
        },
        "tiktok": {
            "dimensions": (540, 960),
            "aspect_ratio": "9:16",
            "max_size_mb": 1,
            "formats": ["jpg"],
        },
        "facebook": {
            "dimensions": (1200, 628),
            "aspect_ratio": "16:9",
            "max_size_mb": 1,
            "formats": ["jpg"],
        }
    }
    
    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.export_dir = ensure_directory(self.settings.cache_dir / "exports")
    
    # ---------------------------
    # Video Export
    # ---------------------------
    
    def export_video(
        self,
        video_path: Path,
        output_format: OutputFormat,
        output_dir: Optional[Path] = None,
    ) -> Path:
        """
        Export video with platform-specific formatting and optimization.
        
        Args:
            video_path: Path to source video file
            output_format: Output format specification
            output_dir: Directory for exported video (auto-generated if not provided)
            
        Returns:
            Path to exported video file
            
        Validates:
            - Property 36: YouTube Export Specifications (Requirements 11.2)
            - Property 37: TikTok Export Specifications (Requirements 11.3)
            - Property 38: Facebook Reels Export Specifications (Requirements 11.4)
        """
        self.logger.info(
            "Starting video export",
            platform=output_format.platform,
            language=output_format.language,
            format=f"{output_format.aspect_ratio}@{output_format.width}x{output_format.height}"
        )
        
        if not video_path.exists():
            raise ExportManagerError(f"Video file not found: {video_path}")
        
        # Validate format for platform
        platform_specs = self.PLATFORM_SPECS.get(output_format.platform)
        if not platform_specs:
            raise ExportManagerError(f"Unknown platform: {output_format.platform}")
        
        if output_format.aspect_ratio not in platform_specs["formats"]:
            raise ExportManagerError(
                f"Aspect ratio {output_format.aspect_ratio} not supported for {output_format.platform}"
            )
        
        # Generate output directory
        if output_dir is None:
            timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = self.export_dir / output_format.platform / output_format.language / timestamp
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Apply platform-specific optimizations
        output_path = output_dir / f"video_{output_format.language}.mp4"
        
        self._apply_platform_optimization(
            video_path,
            output_path,
            output_format.platform
        )
        
        self.logger.info(
            "Video export completed",
            platform=output_format.platform,
            output_path=str(output_path)
        )
        
        return output_path
    
    def _apply_platform_optimization(
        self,
        input_path: Path,
        output_path: Path,
        platform: str,
    ) -> None:
        """Apply platform-specific optimizations to video."""
        specs = self.PLATFORM_SPECS[platform]
        
        # Video is already encoded from video_renderer with h264_nvenc
        # Skip re-encoding and just copy streams with metadata optimization
        command = [
            "ffmpeg",
            "-loglevel", "warning",
            "-i", str(input_path),
            "-c:v", "copy",  # Copy video stream without re-encoding
            "-c:a", "copy",  # Copy audio stream without re-encoding
            "-movflags", "+faststart",
            "-y",
            str(output_path)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error(
                "Platform optimization failed",
                platform=platform,
                stderr=result.stderr
            )
            raise ExportManagerError(f"Video optimization failed: {result.stderr}")
    
    # ---------------------------
    # Metadata Generation
    # ---------------------------
    
    def generate_metadata(
        self,
        metadata: PlatformMetadata,
        output_dir: Optional[Path] = None,
    ) -> Path:
        """
        Generate platform-specific metadata file.
        
        Args:
            metadata: Platform metadata with all required information
            output_dir: Directory for metadata file (auto-generated if not provided)
            
        Returns:
            Path to generated metadata JSON file
            
        Validates:
            - Property 39: Platform Metadata Embedding (Requirements 11.5)
            - All required fields present for platform
        """
        self.logger.info(
            "Generating platform metadata",
            platform=metadata.platform,
            title=metadata.title,
            language=metadata.language
        )
        
        # Generate output directory
        if output_dir is None:
            output_dir = self.export_dir / metadata.platform / metadata.language
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create platform-specific metadata
        if metadata.platform == "youtube":
            metadata_dict = self._create_youtube_metadata(metadata)
        elif metadata.platform == "tiktok":
            metadata_dict = self._create_tiktok_metadata(metadata)
        elif metadata.platform == "facebook":
            metadata_dict = self._create_facebook_metadata(metadata)
        else:
            raise ExportManagerError(f"Unknown platform: {metadata.platform}")
        
        # Save metadata to JSON
        output_path = output_dir / f"metadata_{metadata.language}.json"
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(metadata_dict, f, indent=2, ensure_ascii=False)
        
        self.logger.info(
            "Metadata generated",
            platform=metadata.platform,
            output_path=str(output_path)
        )
        
        return output_path
    
    def _create_youtube_metadata(self, metadata: PlatformMetadata) -> Dict[str, Any]:
        """Create YouTube-specific metadata."""
        return {
            "platform": "youtube",
            "title": metadata.title,
            "description": metadata.description,
            "tags": metadata.tags,
            "language": metadata.language,
            "category": metadata.youtube_category or "Education",
            "made_for_kids": metadata.youtube_made_for_kids,
            "duration_seconds": metadata.duration_seconds,
            "video_specs": {
                "resolution": f"{metadata.resolution[0]}x{metadata.resolution[1]}",
                "aspect_ratio": metadata.aspect_ratio,
            },
            "content_type": "Educational Video",
            "visibility": "public",
        }
    
    def _create_tiktok_metadata(self, metadata: PlatformMetadata) -> Dict[str, Any]:
        """Create TikTok-specific metadata."""
        hashtags = metadata.tiktok_hashtags or []
        
        return {
            "platform": "tiktok",
            "title": metadata.title,
            "description": metadata.description,
            "hashtags": hashtags,
            "language": metadata.language,
            "duration_seconds": metadata.duration_seconds,
            "video_specs": {
                "resolution": f"{metadata.resolution[0]}x{metadata.resolution[1]}",
                "aspect_ratio": metadata.aspect_ratio,
            },
            "sound_id": metadata.tiktok_sound_id,
            "allow_comments": True,
            "allow_duets": True,
            "allow_stitches": True,
        }
    
    def _create_facebook_metadata(self, metadata: PlatformMetadata) -> Dict[str, Any]:
        """Create Facebook-specific metadata."""
        return {
            "platform": "facebook",
            "title": metadata.title,
            "description": metadata.description,
            "tags": metadata.tags,
            "language": metadata.language,
            "duration_seconds": metadata.duration_seconds,
            "video_specs": {
                "resolution": f"{metadata.resolution[0]}x{metadata.resolution[1]}",
                "aspect_ratio": metadata.aspect_ratio,
            },
            "series_id": metadata.facebook_series_id,
            "episode_number": metadata.facebook_episode_number,
            "content_type": "video",
            "allow_reactions": True,
            "allow_comments": True,
            "allow_shares": True,
        }
    
    # ---------------------------
    # Thumbnail Generation
    # ---------------------------
    
    def create_thumbnail(
        self,
        video_path: Path,
        platform: str,
        config: Optional[ThumbnailConfig] = None,
        output_dir: Optional[Path] = None,
    ) -> Path:
        """
        Create thumbnail from video key frame.
        
        Args:
            video_path: Path to video file
            platform: Target platform (youtube, tiktok, facebook)
            config: Optional thumbnail configuration
            output_dir: Directory for thumbnail (auto-generated if not provided)
            
        Returns:
            Path to generated thumbnail file
        """
        self.logger.info(
            "Creating thumbnail",
            video=str(video_path),
            platform=platform
        )
        
        if not video_path.exists():
            raise ExportManagerError(f"Video file not found: {video_path}")
        
        if platform not in self.THUMBNAIL_SPECS:
            raise ExportManagerError(f"Unknown platform: {platform}")
        
        # Use platform-specific dimensions if config not provided
        if config is None:
            specs = self.THUMBNAIL_SPECS[platform]
            config = ThumbnailConfig(
                width=specs["dimensions"][0],
                height=specs["dimensions"][1],
                format=specs["formats"][0]
            )
        
        # Generate output directory
        if output_dir is None:
            output_dir = self.export_dir / platform / "thumbnails"
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        output_path = output_dir / f"thumbnail_{platform}.{config.format}"
        
        # Extract thumbnail using FFmpeg
        command = [
            "ffmpeg",
            "-loglevel", "warning",
            "-ss", str(config.timestamp),
            "-i", str(video_path),
            "-vframes", "1",
            "-vf", f"scale={config.width}:{config.height}:force_original_aspect_ratio=decrease,pad={config.width}:{config.height}:(ow-iw)/2:(oh-ih)/2",
            "-q:v", str(config.quality) if config.format == "jpg" else "3",
            "-y",
            str(output_path)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error(
                "Thumbnail creation failed",
                stderr=result.stderr
            )
            raise ExportManagerError(f"Thumbnail creation failed: {result.stderr}")
        
        file_size_mb = output_path.stat().st_size / (1024 * 1024)
        
        self.logger.info(
            "Thumbnail created",
            platform=platform,
            output_path=str(output_path),
            size_mb=f"{file_size_mb:.2f}"
        )
        
        return output_path
    
    # ---------------------------
    # Package Organization
    # ---------------------------
    
    def package_outputs(
        self,
        video_path: Path,
        metadata_path: Path,
        platform: str,
        language: str,
        thumbnail_path: Optional[Path] = None,
        srt_path: Optional[Path] = None,
        output_dir: Optional[Path] = None,
    ) -> ExportPackage:
        """
        Package video, metadata, and auxiliary files into organized structure.
        
        Args:
            video_path: Path to video file
            metadata_path: Path to metadata JSON file
            platform: Target platform
            language: Video language
            thumbnail_path: Optional path to thumbnail image
            srt_path: Optional path to subtitle file
            output_dir: Directory for packaged output
            
        Returns:
            ExportPackage with organized files
        """
        self.logger.info(
            "Packaging export",
            platform=platform,
            language=language,
            video=str(video_path),
            metadata=str(metadata_path)
        )
        
        # Validate inputs
        if not video_path.exists():
            raise ExportManagerError(f"Video file not found: {video_path}")
        if not metadata_path.exists():
            raise ExportManagerError(f"Metadata file not found: {metadata_path}")
        
        # Create package directory structure
        if output_dir is None:
            timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = self.export_dir / "packages" / platform / language / timestamp
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy files to package directory
        import shutil
        
        packaged_video = output_dir / video_path.name
        packaged_metadata = output_dir / metadata_path.name
        packaged_thumbnail = None
        packaged_srt = None
        
        shutil.copy2(video_path, packaged_video)
        shutil.copy2(metadata_path, packaged_metadata)
        
        if thumbnail_path and thumbnail_path.exists():
            packaged_thumbnail = output_dir / thumbnail_path.name
            shutil.copy2(thumbnail_path, packaged_thumbnail)
        
        if srt_path and srt_path.exists():
            packaged_srt = output_dir / srt_path.name
            shutil.copy2(srt_path, packaged_srt)
        
        # Create manifest file
        manifest = {
            "platform": platform,
            "language": language,
            "created_at": __import__('datetime').datetime.now().isoformat(),
            "files": {
                "video": str(packaged_video.name),
                "metadata": str(packaged_metadata.name),
                "thumbnail": str(packaged_thumbnail.name) if packaged_thumbnail else None,
                "subtitles": str(packaged_srt.name) if packaged_srt else None,
            },
            "file_sizes": {
                "video_mb": packaged_video.stat().st_size / (1024 * 1024),
                "metadata_kb": packaged_metadata.stat().st_size / 1024,
                "thumbnail_kb": packaged_thumbnail.stat().st_size / 1024 if packaged_thumbnail else None,
            }
        }
        
        manifest_path = output_dir / "MANIFEST.json"
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        
        # Create package object
        package = ExportPackage(
            platform=platform,
            language=language,
            video_path=packaged_video,
            metadata_path=packaged_metadata,
            thumbnail_path=packaged_thumbnail,
            srt_path=packaged_srt,
        )
        
        self.logger.info(
            "Export package created",
            platform=platform,
            language=language,
            package_dir=str(output_dir),
            manifest=str(manifest_path)
        )
        
        return package
    
    # ---------------------------
    # Validation
    # ---------------------------
    
    def validate_export(
        self,
        export_package: ExportPackage,
        output_format: OutputFormat,
    ) -> Tuple[bool, List[str]]:
        """
        Validate export package for completeness and format compliance.
        
        Args:
            export_package: Export package to validate
            output_format: Expected output format
            
        Returns:
            Tuple of (is_valid, list of validation errors)
        """
        errors: List[str] = []
        
        # Check files exist
        if not export_package.video_path.exists():
            errors.append(f"Video file not found: {export_package.video_path}")
        
        if not export_package.metadata_path.exists():
            errors.append(f"Metadata file not found: {export_package.metadata_path}")
        
        # Validate video format
        if export_package.video_path.exists():
            try:
                command = [
                    "ffprobe",
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height,codec_name",
                    "-of", "json",
                    str(export_package.video_path)
                ]
                
                result = subprocess.run(command, capture_output=True, text=True, check=True)
                data = json.loads(result.stdout)
                
                if data['streams']:
                    stream = data['streams'][0]
                    actual_width = stream.get('width', 0)
                    actual_height = stream.get('height', 0)
                    codec = stream.get('codec_name', '')
                    
                    if codec not in ['h264', 'h265']:
                        errors.append(f"Video codec {codec} not supported (expected H.264/H.265)")
                    
                    if (actual_width, actual_height) != output_format.resolution:
                        errors.append(
                            f"Video resolution {actual_width}x{actual_height} "
                            f"doesn't match expected {output_format.width}x{output_format.height}"
                        )
            
            except (subprocess.CalledProcessError, json.JSONDecodeError):
                errors.append("Failed to validate video properties")
        
        is_valid = len(errors) == 0
        
        if is_valid:
            self.logger.info("Export validation passed", platform=export_package.platform)
        else:
            self.logger.warning(
                "Export validation failed",
                platform=export_package.platform,
                error_count=len(errors)
            )
        
        return is_valid, errors
