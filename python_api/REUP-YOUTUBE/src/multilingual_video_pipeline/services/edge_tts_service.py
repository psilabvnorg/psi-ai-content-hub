"""
Text-to-Speech Service using Microsoft Edge TTS for multilingual speech synthesis.

This service synthesizes translated text into speech using the Edge TTS API,
with support for all target languages without requiring reference audio files.

Features:
- Multi-language speech synthesis (Vietnamese, Japanese, German, English)
- 400+ voice options per language
- No reference audio files needed
- Natural prosody and emotion support
- Requires internet connection
- High-quality neural voices from Microsoft
"""

import asyncio
import time
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass

import edge_tts

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import TranslatedScript
from ..utils.file_utils import ensure_directory


class EdgeTTSError(Exception):
    """Exception raised during Edge TTS synthesis."""
    pass


@dataclass
class VoiceProfile:
    """Configuration for a voice profile."""
    name: str
    language: str
    language_code: str  # Language code for Edge TTS (e.g., "en-US", "vi-VN")
    voice_name: str     # Full voice name for Edge TTS (e.g., "en-US-AriaNeural")
    gender: str = "female"
    emotion: str = "neutral"


class EdgeTTSService(LoggerMixin):
    """
    Text-to-Speech service using Microsoft Edge TTS.
    
    Features:
    - Multi-language synthesis (Vietnamese, Japanese, German, English)
    - No reference audio files needed
    - Natural prosody and emotion
    - Requires internet connection
    - Uses Microsoft's neural voices
    """
    
    # Language-to-voice mapping for Edge TTS
    VOICE_PROFILES = {
        'vi': {
            'language_code': 'vi-VN',
            'voice_name': 'vi-VN-HoaiMyNeural',  # Female voice
            'voice_name_male': 'vi-VN-NamMinhNeural',
        },
        'ja': {
            'language_code': 'ja-JP',
            'voice_name': 'ja-JP-NanamiNeural',  # Female voice
            'voice_name_male': 'ja-JP-KeitaNeural',
        },
        'de': {
            'language_code': 'de-DE',
            'voice_name': 'de-DE-KatjaNeural',  # Female voice
            'voice_name_male': 'de-DE-ConradNeural',
        },
        'en': {
            'language_code': 'en-US',
            'voice_name': 'en-US-AriaNeural',  # Female voice (premium)
            'voice_name_male': 'en-US-GuyNeural',
        },
    }
    
    def __init__(self, settings=None):
        """
        Initialize the Edge TTS Service.
        
        Args:
            settings: Optional settings override
        """
        self.settings = settings or get_settings()
        self._voice_profiles: Dict[str, VoiceProfile] = {}
        self._init_voice_profiles()
        
        self.logger.info(
            "Edge TTS Service initialized",
            supported_languages=list(self._voice_profiles.keys()),
            audio_sample_rate=self.settings.audio_sample_rate
        )
    
    def _init_voice_profiles(self):
        """Initialize voice profiles for each language."""
        for lang, voice_config in self.VOICE_PROFILES.items():
            self._voice_profiles[lang] = VoiceProfile(
                name=f"{lang}_female_default",
                language=lang,
                language_code=voice_config['language_code'],
                voice_name=voice_config['voice_name'],
                gender='female',
                emotion='neutral'
            )
    
    def synthesize_speech(
        self,
        translated_script: TranslatedScript,
        output_dir: Optional[Path] = None,
        emotion: str = "neutral"
    ) -> Path:
        """
        Synthesize speech from translated script segments using Edge TTS.
        
        Args:
            translated_script: TranslatedScript containing segments to synthesize
            output_dir: Output directory for audio files
            emotion: Emotion to apply (currently not used by Edge TTS)
            
        Returns:
            Path to the synthesized audio file
            
        Raises:
            EdgeTTSError: If synthesis fails
        """
        if output_dir is None:
            output_dir = ensure_directory(self.settings.output_dir / "audio")
        else:
            ensure_directory(output_dir)
        
        target_language = translated_script.target_language
        
        self.logger.info("Starting speech synthesis with Edge TTS",
                        target_language=target_language,
                        segments=len(translated_script.translated_segments))
        
        start_time = time.time()
        
        try:
            # Get voice profile for target language
            voice_profile = self._voice_profiles.get(target_language)
            if not voice_profile:
                self.logger.warning(f"No voice profile for {target_language}, using English")
                voice_profile = self._voice_profiles['en']
            
            # Combine all segments into single text
            full_text = " ".join([
                segment.text for segment in translated_script.translated_segments
                if segment.text and segment.text.strip()
            ])
            
            if not full_text.strip():
                raise EdgeTTSError("No text to synthesize")
            
            # Generate audio using Edge TTS
            output_file = self._get_output_filename(translated_script, output_dir)
            
            # Run async synthesis
            asyncio.run(self._synthesize_async(
                full_text,
                voice_profile,
                output_file
            ))
            
            duration = time.time() - start_time
            
            if not output_file.exists():
                raise EdgeTTSError(f"Output file not created: {output_file}")
            
            file_size_mb = output_file.stat().st_size / (1024 * 1024)
            
            self.logger.info("Speech synthesis completed",
                           target_language=target_language,
                           segments=len(translated_script.translated_segments),
                           output_file=str(output_file),
                           file_size_mb=f"{file_size_mb:.2f}",
                           duration_seconds=round(duration, 2))
            
            return output_file
            
        except Exception as e:
            self.logger.error("Speech synthesis failed",
                            target_language=target_language,
                            error=str(e))
            raise EdgeTTSError(f"Failed to synthesize speech: {str(e)}")
    
    async def _synthesize_async(
        self,
        text: str,
        voice_profile: VoiceProfile,
        output_file: Path
    ) -> None:
        """
        Asynchronously synthesize speech using Edge TTS.
        
        Args:
            text: Text to synthesize
            voice_profile: Voice profile to use
            output_file: Path to save output MP3 file
        """
        try:
            communicate = edge_tts.Communicate(
                text=text,
                voice=voice_profile.voice_name,
                rate="+0%",  # +0% = normal speed
                volume="+0%"  # +0% = normal volume
            )
            
            self.logger.debug(f"Synthesizing with voice: {voice_profile.voice_name}")
            
            # Save to MP3 (Edge TTS natively outputs MP3)
            # Use .mp3 extension then convert to .wav if needed
            mp3_file = output_file.with_suffix('.mp3')
            await communicate.save(str(mp3_file))
            
            # Convert MP3 to WAV using ffmpeg for consistency
            self._convert_mp3_to_wav(mp3_file, output_file)
            
            # Clean up MP3
            if mp3_file.exists():
                mp3_file.unlink()
            
        except Exception as e:
            self.logger.error(f"Async synthesis failed: {str(e)}")
            raise
    
    def _convert_mp3_to_wav(self, mp3_file: Path, wav_file: Path) -> None:
        """Convert MP3 to WAV using ffmpeg."""
        import subprocess
        
        command = [
            "ffmpeg",
            "-loglevel", "error",
            "-i", str(mp3_file),
            "-acodec", "pcm_s16le",
            "-ar", str(self.settings.audio_sample_rate),
            "-ac", "1",  # Mono
            "-y",
            str(wav_file)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            raise EdgeTTSError(f"MP3 to WAV conversion failed: {result.stderr}")
    
    def _get_output_filename(self, translated_script: TranslatedScript, output_dir: Path) -> Path:
        """Generate output filename for synthesized audio."""
        base_name = f"tts_{translated_script.target_language}_{int(time.time())}"
        return output_dir / f"{base_name}.wav"
    
    def get_service_info(self) -> Dict:
        """Get information about the TTS service."""
        return {
            "service": "Edge TTS",
            "supported_languages": list(self._voice_profiles.keys()),
            "requires_internet": True,
            "requires_reference_audio": False,
            "voice_profiles": {
                lang: {
                    "name": profile.voice_name,
                    "language_code": profile.language_code
                }
                for lang, profile in self._voice_profiles.items()
            }
        }
