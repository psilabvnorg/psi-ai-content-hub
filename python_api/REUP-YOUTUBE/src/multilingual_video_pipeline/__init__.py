"""
Multilingual Video Pipeline

An automated system for transforming YouTube videos into multilingual versions
with replaced visuals and emotional female narration.
"""

__version__ = "0.1.0"
__author__ = "PsiLab Technology"

from .models import (
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

__all__ = [
    "VideoMetadata",
    "Transcript", 
    "TranscriptSegment",
    "TranslatedScript",
    "Scene",
    "OutputFormat",
    "JobStatus",
    "TranscriptionModel",
    "AssetType",
    "JobStatusEnum",
    "VisualAsset",
    "VideoStyle",
    "ProcessingMetrics",
]