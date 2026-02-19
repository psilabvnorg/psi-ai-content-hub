"""
Configuration management for the multilingual video pipeline.
"""

import os
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Project paths
    project_root: Path = Field(default_factory=lambda: Path(__file__).parent.parent.parent)
    data_dir: Path = Field(default_factory=lambda: Path("data"))
    output_dir: Path = Field(default_factory=lambda: Path("output"))
    cache_dir: Path = Field(default_factory=lambda: Path("cache"))
    logs_dir: Path = Field(default_factory=lambda: Path("logs"))
    
    # Video processing settings
    max_concurrent_jobs: int = Field(default=5, ge=1, le=20)
    video_quality: str = Field(default="best", description="yt-dlp quality selector")
    audio_format: str = Field(default="wav", description="Audio format for processing")
    
    # Transcription settings
    whisper_model: str = Field(default="base", description="Whisper model size")
    phowhisper_model: str = Field(default="base", description="PhoWhisper model size")
    phowhisper_model_path: str = Field(
        default="/home/psilab/TRANSCRIBE-AUDIO-TO-TEXT-WHISPER/model/snapshots/55a7e3eb6c906de891f8f06a107754427dd3be79",
        description="Path to local PhoWhisper model directory"
    )
    transcription_device: str = Field(default="cpu", description="Device for transcription")
    
    # Translation settings
    target_languages: List[str] = Field(default=["vi", "ja", "de", "en"])
    translation_model_path: str = Field(
        default="/home/psilab/.cache/huggingface/hub/models--tencent--HY-MT1.5-1.8B-FP8",
        description="Path to local Tencent HY-MT1.5-1.8B-FP8 translation model (pre-downloaded)"
    )
    translation_device: str = Field(default="auto", description="Device for translation (auto, cuda, cpu)")
    max_translation_retries: int = Field(default=3, ge=1, le=10)
    
    # TTS settings
    tts_model: str = Field(default="F5TTS_Base", description="F5-TTS model name (F5TTS_Base, F5TTS_Small)")
    tts_checkpoint: Optional[str] = Field(default="/home/psilab/F5-TTS-Vietnamese/model/model_last.pt", description="Path to F5-TTS checkpoint file")
    tts_vocab_file: Optional[str] = Field(default="/home/psilab/F5-TTS-Vietnamese/model/vocab.txt", description="Path to F5-TTS vocabulary file")
    tts_device: str = Field(default="auto", description="Device for TTS (auto, cuda, cpu)")
    tts_vocoder: str = Field(default="vocos", description="Vocoder for F5-TTS (vocos or bigvgan)")
    voice_gender: str = Field(default="female", description="Voice gender preference")
    audio_sample_rate: int = Field(default=48000, description="Audio sample rate in Hz")
    target_lufs: float = Field(default=-16.0, description="Target loudness in LUFS")
    
    # Vietnamese voice reference (used for F5-TTS voice cloning)
    vi_ref_audio: str = Field(default="data/voice_refs/vi_female.wav", description="Vietnamese reference audio path")
    vi_ref_text: str = Field(default="mời quý khán giả theo dõi bản tin của đài truyền hình việt nam, tỉnh khánh hòa và tỉnh đắc lắc hưởng ứng chiến dịch quang trung thần tốc xây dựng, và sửa chữa nhà cho các hộ dân bị thiệt hại sau lũ, khánh hòa khởi công", description="Vietnamese reference audio transcription")
    
    # Video rendering settings
    output_resolution_horizontal: tuple = Field(default=(1920, 1080))
    output_resolution_vertical: tuple = Field(default=(1080, 1920))
    video_codec: str = Field(default="h264_nvenc", description="Video codec (use h264_nvenc for NVIDIA GPU, libx264 for CPU)")
    audio_codec: str = Field(default="aac", description="Audio codec")
    video_bitrate: str = Field(default="5M", description="Video bitrate")
    audio_bitrate: str = Field(default="192k", description="Audio bitrate")
    
    # External API settings
    google_api_key: Optional[str] = Field(default=None, env="GOOGLE_API_KEY")
    civitai_api_key: Optional[str] = Field(default=None, env="CIVITAI_API_KEY")
    api_base_url: str = Field(default="http://127.0.0.1:6901", description="App API base URL")
    translation_api_url: str = Field(default="http://127.0.0.1:6906", description="Translation API base URL")
    image_finder_api_url: str = Field(default="http://127.0.0.1:6907", description="ImageFinder API base URL")
    whisper_api_url: str = Field(default="http://127.0.0.1:6904", description="Whisper STT API base URL")
    vieneu_tts_api_url: str = Field(default="http://127.0.0.1:6903", description="VieNeu-TTS API base URL")
    use_api_services: bool = Field(default=True, description="Use REST APIs instead of in-process processing")
    api_timeout: int = Field(default=600, description="API request timeout in seconds")
    api_poll_interval: float = Field(default=1.0, description="SSE polling interval in seconds")
    vieneu_backbone: str = Field(default="gpu-full", description="VieNeu-TTS backbone model")
    vieneu_codec: str = Field(default="neucodec-standard", description="VieNeu-TTS codec")
    vieneu_voice_id: str = Field(default="", description="VieNeu-TTS voice ID for synthesis")
    
    # Database settings
    database_url: str = Field(default="sqlite:///pipeline.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    
    # Logging settings
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(default="json", description="Log format: json or text")
    
    # Rate limiting
    youtube_rate_limit: int = Field(default=10, description="YouTube requests per minute")
    image_download_rate_limit: int = Field(default=30, description="Image downloads per minute")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get the global settings instance."""
    return settings


def create_directories():
    """Create necessary directories if they don't exist."""
    directories = [
        settings.data_dir,
        settings.output_dir,
        settings.cache_dir,
        settings.logs_dir,
        settings.data_dir / "videos",
        settings.data_dir / "audio",
        settings.data_dir / "images",
        settings.data_dir / "transcripts",
        settings.data_dir / "translations",
        settings.output_dir / "horizontal",
        settings.output_dir / "vertical",
        settings.cache_dir / "images",
        settings.cache_dir / "models",
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)


# Create directories on import
create_directories()
