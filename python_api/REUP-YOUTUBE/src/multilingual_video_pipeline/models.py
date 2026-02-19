"""
Core data models for the multilingual video pipeline.
"""

import json
from dataclasses import dataclass, asdict, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple, Union, Dict, Any

from .logging_config import get_logger

logger = get_logger(__name__)


class TranscriptionModel(Enum):
    """Enumeration of available transcription models."""
    PHOWHISPER = "phowhisper"  # Vietnamese-optimized model
    WHISPER_MULTILINGUAL = "whisper_multilingual"  # OpenAI Whisper for other languages
    WHISPER_FALLBACK = "whisper_fallback"  # Fallback for Vietnamese if PhoWhisper fails


class AssetType(Enum):
    """Enumeration of visual asset types."""
    STATIC_IMAGE = "static_image"
    ANIMATED_GIF = "animated_gif"
    VIDEO_CLIP = "video_clip"
    LOTTIE_ANIMATION = "lottie_animation"


class JobStatusEnum(Enum):
    """Enumeration of job processing statuses."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class VideoMetadata:
    """Metadata for a source video."""
    video_id: str
    title: str
    description: str
    duration: float  # seconds
    upload_date: datetime
    channel_name: str
    channel_url: str
    original_language: str
    tags: List[str]
    
    def __post_init__(self):
        """Validate data after initialization."""
        if self.duration <= 0:
            raise ValueError("Duration must be positive")
        if not self.video_id:
            raise ValueError("Video ID cannot be empty")
        if not self.title:
            raise ValueError("Title cannot be empty")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data['upload_date'] = self.upload_date.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VideoMetadata':
        """Create instance from dictionary."""
        data = data.copy()
        if isinstance(data['upload_date'], str):
            data['upload_date'] = datetime.fromisoformat(data['upload_date'])
        return cls(**data)
    
    def save_to_file(self, file_path: Union[str, Path]) -> None:
        """Save metadata to JSON file."""
        file_path = Path(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        
        logger.debug("Video metadata saved", file=str(file_path), video_id=self.video_id)
    
    @classmethod
    def load_from_file(cls, file_path: Union[str, Path]) -> 'VideoMetadata':
        """Load metadata from JSON file."""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        instance = cls.from_dict(data)
        logger.debug("Video metadata loaded", file=str(file_path), video_id=instance.video_id)
        return instance


@dataclass
class TranscriptSegment:
    """A segment of transcribed text with timing information."""
    text: str
    start_time: float  # seconds
    end_time: float
    confidence: float
    words: Optional[List[Dict[str, Any]]] = None  # Word-level timing: [{'word': 'hello', 'start': 0.5, 'end': 0.8}, ...]
    
    def __post_init__(self):
        """Validate data after initialization."""
        if self.start_time < 0:
            raise ValueError("Start time cannot be negative")
        if self.end_time <= self.start_time:
            raise ValueError("End time must be greater than start time")
        if not 0 <= self.confidence <= 1:
            raise ValueError("Confidence must be between 0 and 1")
        if not self.text.strip():
            raise ValueError("Text cannot be empty")
    
    @property
    def duration(self) -> float:
        """Get segment duration in seconds."""
        return self.end_time - self.start_time
    
    def overlaps_with(self, other: 'TranscriptSegment') -> bool:
        """Check if this segment overlaps with another."""
        return max(self.start_time, other.start_time) < min(self.end_time, other.end_time)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TranscriptSegment':
        """Create instance from dictionary."""
        return cls(**data)


@dataclass
class Transcript:
    """Complete transcript with segments and metadata."""
    segments: List[TranscriptSegment]
    language: str
    full_text: str
    transcription_model: TranscriptionModel
    model_confidence: float
    
    def __post_init__(self):
        """Validate data after initialization."""
        if not self.segments:
            raise ValueError("Transcript must have at least one segment")
        if not 0 <= self.model_confidence <= 1:
            raise ValueError("Model confidence must be between 0 and 1")
        if not self.language:
            raise ValueError("Language cannot be empty")
        
        # Validate segments are in chronological order
        for i in range(1, len(self.segments)):
            if self.segments[i].start_time < self.segments[i-1].end_time:
                logger.warning("Transcript segments may overlap", 
                             segment_index=i,
                             current_start=self.segments[i].start_time,
                             previous_end=self.segments[i-1].end_time)
    
    @property
    def duration(self) -> float:
        """Get total transcript duration in seconds."""
        if not self.segments:
            return 0.0
        return self.segments[-1].end_time - self.segments[0].start_time
    
    @property
    def word_count(self) -> int:
        """Get approximate word count."""
        return len(self.full_text.split())
    
    @property
    def average_confidence(self) -> float:
        """Get average confidence across all segments."""
        if not self.segments:
            return 0.0
        return sum(seg.confidence for seg in self.segments) / len(self.segments)
    
    def get_text_at_time(self, timestamp: float) -> Optional[str]:
        """Get text at a specific timestamp."""
        for segment in self.segments:
            if segment.start_time <= timestamp <= segment.end_time:
                return segment.text
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'segments': [seg.to_dict() for seg in self.segments],
            'language': self.language,
            'full_text': self.full_text,
            'transcription_model': self.transcription_model.value,
            'model_confidence': self.model_confidence,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Transcript':
        """Create instance from dictionary."""
        data = data.copy()
        data['segments'] = [TranscriptSegment.from_dict(seg) for seg in data['segments']]
        data['transcription_model'] = TranscriptionModel(data['transcription_model'])
        return cls(**data)
    
    def save_to_file(self, file_path: Union[str, Path]) -> None:
        """Save transcript to JSON file."""
        file_path = Path(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        
        logger.debug("Transcript saved", 
                    file=str(file_path), 
                    language=self.language,
                    segments=len(self.segments))
    
    @classmethod
    def load_from_file(cls, file_path: Union[str, Path]) -> 'Transcript':
        """Load transcript from JSON file."""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"Transcript file not found: {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        instance = cls.from_dict(data)
        logger.debug("Transcript loaded", 
                    file=str(file_path), 
                    language=instance.language,
                    segments=len(instance.segments))
        return instance


@dataclass
class TranslatedScript:
    """Translated script with timing and quality information."""
    original: Transcript
    translated_segments: List[TranscriptSegment]
    target_language: str
    duration_ratio: float  # translated_duration / original_duration
    
    def __post_init__(self):
        """Validate data after initialization."""
        if not self.translated_segments:
            raise ValueError("Translated script must have at least one segment")
        if len(self.translated_segments) != len(self.original.segments):
            raise ValueError("Number of translated segments must match original")
        if self.duration_ratio <= 0:
            raise ValueError("Duration ratio must be positive")
        if not self.target_language:
            raise ValueError("Target language cannot be empty")
    
    @property
    def full_translated_text(self) -> str:
        """Get full translated text."""
        return " ".join(seg.text for seg in self.translated_segments)
    
    @property
    def translation_quality_score(self) -> float:
        """Get average confidence of translated segments."""
        if not self.translated_segments:
            return 0.0
        return sum(seg.confidence for seg in self.translated_segments) / len(self.translated_segments)
    
    @property
    def is_duration_acceptable(self) -> bool:
        """Check if duration ratio is within acceptable range (0.8 to 1.2)."""
        return 0.8 <= self.duration_ratio <= 1.2
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'original': self.original.to_dict(),
            'translated_segments': [seg.to_dict() for seg in self.translated_segments],
            'target_language': self.target_language,
            'duration_ratio': self.duration_ratio,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TranslatedScript':
        """Create instance from dictionary."""
        data = data.copy()
        data['original'] = Transcript.from_dict(data['original'])
        data['translated_segments'] = [TranscriptSegment.from_dict(seg) for seg in data['translated_segments']]
        return cls(**data)

    def save_to_file(self, file_path: Union[str, Path]) -> None:
        """Save translated script to JSON file."""
        file_path = Path(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)

        logger.debug("Translated script saved",
                     file=str(file_path),
                     target_language=self.target_language,
                     segments=len(self.translated_segments))

    @classmethod
    def load_from_file(cls, file_path: Union[str, Path]) -> 'TranslatedScript':
        """Load translated script from JSON file."""
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"Translated script file not found: {file_path}")

        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        instance = cls.from_dict(data)
        logger.debug("Translated script loaded",
                     file=str(file_path),
                     target_language=instance.target_language,
                     segments=len(instance.translated_segments))
        return instance


@dataclass
class VisualAsset:
    """Visual asset (image, animation, or video clip) for scene replacement."""
    asset_id: str
    asset_type: AssetType
    file_path: Path
    source_url: Optional[str]
    width: int
    height: int
    duration: Optional[float]  # For animations/video clips
    tags: List[str]
    
    def __post_init__(self):
        """Validate data after initialization."""
        if self.width <= 0 or self.height <= 0:
            raise ValueError("Width and height must be positive")
        if not self.asset_id:
            raise ValueError("Asset ID cannot be empty")
        if self.asset_type in [AssetType.ANIMATED_GIF, AssetType.VIDEO_CLIP] and self.duration is None:
            raise ValueError("Duration required for animated assets")
    
    @property
    def aspect_ratio(self) -> float:
        """Get aspect ratio (width/height)."""
        return self.width / self.height
    
    @property
    def is_horizontal(self) -> bool:
        """Check if asset is horizontal format."""
        return self.aspect_ratio > 1.0
    
    @property
    def is_vertical(self) -> bool:
        """Check if asset is vertical format."""
        return self.aspect_ratio < 1.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data['asset_type'] = self.asset_type.value
        data['file_path'] = str(self.file_path)
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VisualAsset':
        """Create instance from dictionary."""
        data = data.copy()
        data['asset_type'] = AssetType(data['asset_type'])
        data['file_path'] = Path(data['file_path'])
        return cls(**data)


@dataclass
class Scene:
    """A scene combining transcript segment with visual and audio elements."""
    scene_id: str
    transcript_segment: TranscriptSegment
    visual_asset: Optional[VisualAsset]
    audio_segment: Optional[Path]  # Path to audio file for this scene
    duration: float
    transition_type: str = "fade"
    
    def __post_init__(self):
        """Validate data after initialization."""
        if self.duration <= 0:
            raise ValueError("Scene duration must be positive")
        if not self.scene_id:
            raise ValueError("Scene ID cannot be empty")
        if abs(self.duration - self.transcript_segment.duration) > 0.1:
            logger.warning("Scene duration differs from transcript segment", 
                          scene_id=self.scene_id,
                          scene_duration=self.duration,
                          transcript_duration=self.transcript_segment.duration)
    
    @property
    def has_visual(self) -> bool:
        """Check if scene has visual asset."""
        return self.visual_asset is not None
    
    @property
    def has_audio(self) -> bool:
        """Check if scene has audio segment."""
        return self.audio_segment is not None and self.audio_segment.exists()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'scene_id': self.scene_id,
            'transcript_segment': self.transcript_segment.to_dict(),
            'visual_asset': self.visual_asset.to_dict() if self.visual_asset else None,
            'audio_segment': str(self.audio_segment) if self.audio_segment else None,
            'duration': self.duration,
            'transition_type': self.transition_type,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Scene':
        """Create instance from dictionary."""
        data = data.copy()
        data['transcript_segment'] = TranscriptSegment.from_dict(data['transcript_segment'])
        if data['visual_asset']:
            data['visual_asset'] = VisualAsset.from_dict(data['visual_asset'])
        if data['audio_segment']:
            data['audio_segment'] = Path(data['audio_segment'])
        return cls(**data)


@dataclass
class OutputFormat:
    """Output format specification for rendered videos."""
    language: str
    aspect_ratio: str  # "16:9" or "9:16"
    resolution: Tuple[int, int]  # (width, height)
    platform: str  # "youtube", "tiktok", "facebook"
    
    def __post_init__(self):
        """Validate data after initialization."""
        if not self.language:
            raise ValueError("Language cannot be empty")
        if self.aspect_ratio not in ["16:9", "9:16"]:
            raise ValueError("Aspect ratio must be '16:9' or '9:16'")
        if len(self.resolution) != 2 or any(r <= 0 for r in self.resolution):
            raise ValueError("Resolution must be tuple of two positive integers")
        if self.platform not in ["youtube", "tiktok", "facebook"]:
            raise ValueError("Platform must be 'youtube', 'tiktok', or 'facebook'")
    
    @property
    def width(self) -> int:
        """Get video width."""
        return self.resolution[0]
    
    @property
    def height(self) -> int:
        """Get video height."""
        return self.resolution[1]
    
    @property
    def is_horizontal(self) -> bool:
        """Check if format is horizontal."""
        return self.aspect_ratio == "16:9"
    
    @property
    def is_vertical(self) -> bool:
        """Check if format is vertical."""
        return self.aspect_ratio == "9:16"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'OutputFormat':
        """Create instance from dictionary."""
        return cls(**data)


@dataclass
class JobStatus:
    """Status information for a processing job."""
    job_id: str
    video_id: str
    status: JobStatusEnum
    current_stage: str
    progress: float  # 0.0 to 1.0
    error_message: Optional[str]
    retry_count: int
    created_at: datetime
    updated_at: datetime
    
    def __post_init__(self):
        """Validate data after initialization."""
        if not 0 <= self.progress <= 1:
            raise ValueError("Progress must be between 0 and 1")
        if self.retry_count < 0:
            raise ValueError("Retry count cannot be negative")
        if not self.job_id:
            raise ValueError("Job ID cannot be empty")
        if not self.video_id:
            raise ValueError("Video ID cannot be empty")
    
    @property
    def is_completed(self) -> bool:
        """Check if job is completed."""
        return self.status == JobStatusEnum.COMPLETED
    
    @property
    def is_failed(self) -> bool:
        """Check if job has failed."""
        return self.status == JobStatusEnum.FAILED
    
    @property
    def is_processing(self) -> bool:
        """Check if job is currently processing."""
        return self.status == JobStatusEnum.PROCESSING
    
    @property
    def duration(self) -> float:
        """Get job duration in seconds."""
        return (self.updated_at - self.created_at).total_seconds()
    
    def update_progress(self, stage: str, progress: float, error: Optional[str] = None) -> None:
        """Update job progress."""
        self.current_stage = stage
        self.progress = max(0.0, min(1.0, progress))
        self.error_message = error
        self.updated_at = datetime.now()
        
        if error:
            self.status = JobStatusEnum.FAILED
        elif progress >= 1.0:
            self.status = JobStatusEnum.COMPLETED
        else:
            self.status = JobStatusEnum.PROCESSING
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data['status'] = self.status.value
        data['created_at'] = self.created_at.isoformat()
        data['updated_at'] = self.updated_at.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'JobStatus':
        """Create instance from dictionary."""
        data = data.copy()
        data['status'] = JobStatusEnum(data['status'])
        if isinstance(data['created_at'], str):
            data['created_at'] = datetime.fromisoformat(data['created_at'])
        if isinstance(data['updated_at'], str):
            data['updated_at'] = datetime.fromisoformat(data['updated_at'])
        return cls(**data)
    
    def save_to_file(self, file_path: Union[str, Path]) -> None:
        """Save job status to JSON file."""
        file_path = Path(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        
        logger.debug("Job status saved", file=str(file_path), job_id=self.job_id)
    
    @classmethod
    def load_from_file(cls, file_path: Union[str, Path]) -> 'JobStatus':
        """Load job status from JSON file."""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"Job status file not found: {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        instance = cls.from_dict(data)
        logger.debug("Job status loaded", file=str(file_path), job_id=instance.job_id)
        return instance


# Additional helper classes for video processing

@dataclass
class Job:
    """Complete job information for pipeline processing."""
    job_id: str
    video_url: str
    target_languages: List[str]
    output_formats: List[str]  # e.g., ["16:9", "9:16"]
    status: JobStatusEnum
    current_service: str = ""
    progress: float = 0.0
    retry_count: int = 0
    max_retries: int = 3
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    intermediate_results: Dict[str, str] = field(default_factory=dict)  # service_name -> output_path
    
    def __post_init__(self):
        """Initialize timestamps if not provided."""
        if self.created_at is None:
            self.created_at = datetime.now()
        if not 0 <= self.progress <= 1:
            raise ValueError("Progress must be between 0 and 1")
        if self.retry_count < 0:
            raise ValueError("Retry count cannot be negative")
    
    @property
    def should_retry(self) -> bool:
        """Check if job should be retried."""
        return self.retry_count < self.max_retries and self.status == JobStatusEnum.FAILED
    
    @property
    def wait_time(self) -> int:
        """Get exponential backoff wait time in seconds."""
        return min(2 ** self.retry_count, 300)  # Cap at 5 minutes
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        data = asdict(self)
        data['status'] = self.status.value
        if self.created_at:
            data['created_at'] = self.created_at.isoformat()
        if self.started_at:
            data['started_at'] = self.started_at.isoformat()
        if self.completed_at:
            data['completed_at'] = self.completed_at.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Job':
        """Create instance from dictionary."""
        data = data.copy()
        data['status'] = JobStatusEnum(data['status'])
        if data.get('created_at') and isinstance(data['created_at'], str):
            data['created_at'] = datetime.fromisoformat(data['created_at'])
        if data.get('started_at') and isinstance(data['started_at'], str):
            data['started_at'] = datetime.fromisoformat(data['started_at'])
        if data.get('completed_at') and isinstance(data['completed_at'], str):
            data['completed_at'] = datetime.fromisoformat(data['completed_at'])
        return cls(**data)


@dataclass
class VideoStyle:
    """Video style information extracted from original video."""
    animation_speed: str  # "slow", "medium", "fast"
    color_palette: List[str]  # Dominant colors as hex codes
    movement_type: str  # "static", "smooth", "dynamic"
    transition_style: str  # "cut", "fade", "slide"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VideoStyle':
        """Create instance from dictionary."""
        return cls(**data)


@dataclass
class ProcessingMetrics:
    """Metrics for tracking processing performance."""
    stage_name: str
    start_time: datetime
    end_time: Optional[datetime]
    input_size: int  # bytes
    output_size: Optional[int]  # bytes
    memory_usage: Optional[float]  # MB
    cpu_usage: Optional[float]  # percentage
    
    @property
    def duration(self) -> Optional[float]:
        """Get processing duration in seconds."""
        if self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    @property
    def throughput(self) -> Optional[float]:
        """Get throughput in bytes per second."""
        if self.duration and self.duration > 0:
            return self.input_size / self.duration
        return None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data['start_time'] = self.start_time.isoformat()
        if self.end_time:
            data['end_time'] = self.end_time.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ProcessingMetrics':
        """Create instance from dictionary."""
        data = data.copy()
        data['start_time'] = datetime.fromisoformat(data['start_time'])
        if data['end_time']:
            data['end_time'] = datetime.fromisoformat(data['end_time'])
        return cls(**data)