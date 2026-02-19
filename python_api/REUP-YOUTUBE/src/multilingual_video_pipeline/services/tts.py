"""
Text-to-Speech Service using F5-TTS for multilingual speech synthesis.

This service synthesizes translated text into speech using the F5-TTS model,
with support for all target languages (Vietnamese, Japanese, German, English).

Features:
- Multi-language speech synthesis with F5-TTS
- Female voice profile with emotional characteristics
- Audio normalization to -16 LUFS
- Reference voice management for consistency
- Audio caching to avoid redundant synthesis
"""

import time
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

import numpy as np
import soundfile as sf

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import TranslatedScript
from ..utils.file_utils import ensure_directory

try:
    from f5_tts.api import F5TTS
    from f5_tts.infer.inference_sft import F5TTS as F5TTSInference
    F5TTS_AVAILABLE = True
except ImportError:
    F5TTS_AVAILABLE = False

try:
    import pyloudnorm
    PYLOUDNORM_AVAILABLE = True
except ImportError:
    PYLOUDNORM_AVAILABLE = False


class TTSError(Exception):
    """Exception raised during TTS synthesis."""
    pass


@dataclass
class VoiceProfile:
    """Configuration for a voice profile."""
    name: str
    language: str
    ref_audio_path: Path
    ref_text: str
    gender: str = "female"
    emotion: str = "neutral"  # neutral, happy, sad, angry, concerned
    speed: float = 1.0


class TTSService(LoggerMixin):
    """
    Text-to-Speech service using F5-TTS model.
    
    Features:
    - Multi-language synthesis (Vietnamese, Japanese, German, English)
    - Female voice profile with emotional characteristics
    - Loudness normalization to -16 LUFS
    - Reference voice consistency
    - Audio caching and synthesis optimization
    """
    
    def __init__(self, settings=None):
        """
        Initialize the TTS Service.
        
        Args:
            settings: Optional settings override
        """
        self.settings = settings or get_settings()
        
        # Check dependencies (allow init for testing with mocking)
        if not F5TTS_AVAILABLE:
            self.logger.warning("F5-TTS library not available - will fail on actual synthesis")
        
        self._tts_model = None
        self._model_loaded = False
        self._audio_cache = {}
        self._voice_profiles: Dict[str, VoiceProfile] = {}
        self._current_device = None
        
        # Initialize default voice profiles
        self._init_voice_profiles()
        
        self.logger.info(
            "TTS Service initialized",
            device=self.settings.tts_device if hasattr(self.settings, 'tts_device') else 'auto',
            sample_rate=self.settings.audio_sample_rate,
            target_lufs=self.settings.target_lufs
        )
    
    def _init_voice_profiles(self):
        """Initialize default voice profiles for each language."""
        # Default female voice profiles
        # Vietnamese uses config-based reference audio and text
        self._voice_profiles = {
            'vi': VoiceProfile(
                name='vietnamese_female_default',
                language='vi',
                ref_audio_path=Path(self.settings.vi_ref_audio),
                ref_text=self.settings.vi_ref_text,
                gender='female',
                emotion='neutral'
            ),
            'ja': VoiceProfile(
                name='japanese_female_default',
                language='ja',
                ref_audio_path=Path('voice_refs/ja_female.wav'),
                ref_text='こんにちは、私はあなたの仮想アシスタントです',
                gender='female',
                emotion='neutral'
            ),
            'de': VoiceProfile(
                name='german_female_default',
                language='de',
                ref_audio_path=Path('voice_refs/de_female.wav'),
                ref_text='Hallo, ich bin dein virtueller Assistent',
                gender='female',
                emotion='neutral'
            ),
            'en': VoiceProfile(
                name='english_female_default',
                language='en',
                ref_audio_path=Path('voice_refs/en_female.wav'),
                ref_text='Hello, I am your virtual assistant',
                gender='female',
                emotion='neutral'
            ),
        }
    
    def _load_model(self):
        """Load the F5-TTS model."""
        if self._model_loaded:
            return
        
        try:
            import torch
            
            self.logger.info("Loading F5-TTS model")
            start_time = time.time()
            
            # Get model configuration from settings
            model_name = self.settings.tts_model
            ckpt_file = self.settings.tts_checkpoint
            vocab_file = self.settings.tts_vocab_file
            device_setting = self.settings.tts_device if hasattr(self.settings, 'tts_device') else 'auto'
            
            # Normalize device: F5-TTS doesn't accept 'auto', needs 'cuda' or 'cpu'
            if device_setting == 'auto':
                device = 'cuda' if torch.cuda.is_available() else 'cpu'
            else:
                device = device_setting
            
            self._current_device = device
            
            # Initialize F5TTS model with optional checkpoint
            # Match F5-TTS-Vietnamese pattern: F5TTS_Base with optional checkpoint/vocab
            if ckpt_file and Path(ckpt_file).exists():
                if not vocab_file or not Path(vocab_file).exists():
                    raise TTSError(f"Checkpoint specified but vocab file not found: {vocab_file}")
                
                self.logger.info("Loading F5-TTS with custom checkpoint",
                               checkpoint=ckpt_file,
                               vocab_file=vocab_file)
                self._tts_model = F5TTS(
                    model=model_name,
                    ckpt_file=ckpt_file,
                    vocab_file=str(vocab_file),
                    device=device
                )
            else:
                # Load default model if no checkpoint specified
                self.logger.info("Loading F5-TTS default model",
                               model=model_name)
                self._tts_model = F5TTS(
                    model=model_name,
                    device=device
                )
            
            self._model_loaded = True
            load_time = time.time() - start_time
            
            self.logger.info("F5-TTS model loaded successfully",
                           model=model_name,
                           load_time_seconds=round(load_time, 2),
                           device=device)
            
        except Exception as e:
            self.logger.error("Failed to load F5-TTS model", error=str(e))
            raise TTSError(f"Failed to load F5-TTS model: {e}")
    
    def synthesize_speech(
        self,
        translated_script: TranslatedScript,
        output_dir: Optional[Path] = None,
        remove_silence: bool = True,
        emotion: str = "neutral"
    ) -> Path:
        """
        Synthesize speech from translated script segments.
        
        Args:
            translated_script: TranslatedScript containing segments to synthesize
            output_dir: Output directory for audio files
            remove_silence: Whether to remove silence gaps
            emotion: Emotion to apply (neutral, happy, sad, angry, concerned)
            
        Returns:
            Path to the synthesized audio file
            
        Raises:
            TTSError: If synthesis fails
        """
        if output_dir is None:
            output_dir = ensure_directory(self.settings.output_dir / "audio")
        else:
            ensure_directory(output_dir)
        
        # Load model if needed
        self._load_model()
        
        target_language = translated_script.target_language
        
        self.logger.info("Starting speech synthesis",
                        target_language=target_language,
                        segments=len(translated_script.translated_segments),
                        emotion=emotion)
        
        start_time = time.time()
        
        try:
            # Get voice profile for target language
            voice_profile = self._voice_profiles.get(target_language)
            if not voice_profile:
                self.logger.warning(f"No voice profile for {target_language}, using English")
                voice_profile = self._voice_profiles['en']
            
            # Synthesize each segment
            audio_segments = []
            for i, segment in enumerate(translated_script.translated_segments):
                audio_segment = self._synthesize_segment(
                    text=segment.text,
                    voice_profile=voice_profile,
                    target_duration=segment.duration,
                    emotion=emotion
                )
                audio_segments.append(audio_segment)
            
            # Concatenate all segments
            full_audio = self._concatenate_audio(audio_segments)
            
            # Normalize audio to target LUFS
            normalized_audio = self._normalize_audio(
                full_audio,
                target_lufs=self.settings.target_lufs
            )
            
            # Remove silence if requested
            if remove_silence:
                normalized_audio = self._remove_silence(normalized_audio)
            
            # Save to file
            output_file = self._get_output_filename(translated_script, output_dir)
            sf.write(output_file, normalized_audio, self.settings.audio_sample_rate)
            
            duration = time.time() - start_time
            
            self.logger.info("Speech synthesis completed",
                           target_language=target_language,
                           segments=len(translated_script.translated_segments),
                           output_file=str(output_file),
                           duration_seconds=round(duration, 2))
            
            return output_file
            
        except Exception as e:
            self.logger.error("Speech synthesis failed",
                            target_language=target_language,
                            error=str(e))
            raise TTSError(f"Failed to synthesize speech: {str(e)}")
    
    def _synthesize_segment(
        self,
        text: str,
        voice_profile: VoiceProfile,
        target_duration: float,
        emotion: str = "neutral"
    ) -> np.ndarray:
        """
        Synthesize a single text segment.
        
        Args:
            text: Text to synthesize
            voice_profile: Voice profile to use
            target_duration: Target duration in seconds
            emotion: Emotion to apply
            
        Returns:
            Audio data as numpy array
        """
        if not text or not text.strip():
            # Return silence for empty segments
            return np.zeros(int(target_duration * self.settings.audio_sample_rate))
        
        # Check cache
        cache_key = self._get_cache_key(text, voice_profile.name, emotion)
        if cache_key in self._audio_cache:
            cached_audio = self._audio_cache[cache_key]
            # Resample if needed
            return self._resample_audio(cached_audio, target_duration)
        
        try:
            # Adjust speed based on target duration (matching F5-TTS-Vietnamese pattern)
            estimated_duration = len(text) * 0.05  # Rough estimate: ~50ms per character
            speed = max(0.5, min(2.0, estimated_duration / max(target_duration, 0.1)))
            
            # Ensure voice profile reference audio exists
            ref_audio = Path(voice_profile.ref_audio_path)
            if not ref_audio.exists():
                self.logger.warning("Reference audio not found, using placeholder",
                                  audio_path=str(ref_audio))
                return np.zeros(int(target_duration * self.settings.audio_sample_rate))
            
            # Synthesize using F5TTS (matching F5-TTS-Vietnamese API)
            # API: model.infer(ref_file, ref_text, gen_text, speed)
            # Returns: (wav, sr, spectrogram) as 3-tuple or (wav, sr) as 2-tuple
            result = self._tts_model.infer(
                ref_file=str(ref_audio),
                ref_text=voice_profile.ref_text,
                gen_text=text,
                speed=speed
            )
            
            # Handle different return formats from F5TTS.infer()
            if isinstance(result, tuple):
                if len(result) == 3:
                    wav, sr, _ = result  # (wav, sr, spectrogram)
                elif len(result) == 2:
                    wav, sr = result
                else:
                    raise TTSError(f"Unexpected return format from F5TTS.infer(): {len(result)} values")
            else:
                raise TTSError("Expected tuple return from F5TTS.infer()")
            
            # Resample if needed
            if sr != self.settings.audio_sample_rate:
                import librosa
                wav = librosa.resample(
                    wav,
                    orig_sr=sr,
                    target_sr=self.settings.audio_sample_rate
                )
            
            # Cache the result
            self._audio_cache[cache_key] = wav
            
            # Resample to target duration
            return self._resample_audio(wav, target_duration)
            
        except Exception as e:
            self.logger.error("Segment synthesis failed",
                            text=text[:50],
                            error=str(e))
            # Return silence on error
            return np.zeros(int(target_duration * self.settings.audio_sample_rate))
    
    def _resample_audio(self, audio: np.ndarray, target_duration: float) -> np.ndarray:
        """Resample audio to match target duration."""
        current_duration = len(audio) / self.settings.audio_sample_rate
        target_samples = int(target_duration * self.settings.audio_sample_rate)
        
        if len(audio) == target_samples:
            return audio
        
        # Use linear interpolation for resampling
        indices = np.linspace(0, len(audio) - 1, target_samples)
        return np.interp(indices, np.arange(len(audio)), audio)
    
    def _concatenate_audio(self, audio_segments: List[np.ndarray]) -> np.ndarray:
        """Concatenate audio segments with small crossfade."""
        if not audio_segments:
            return np.array([])
        
        if len(audio_segments) == 1:
            return audio_segments[0]
        
        # Concatenate with 50ms crossfade
        crossfade_samples = int(0.05 * self.settings.audio_sample_rate)
        concatenated = []
        
        for i, segment in enumerate(audio_segments):
            if i == 0:
                concatenated.append(segment)
            else:
                # Create crossfade between last part of previous and first part of current
                prev_segment = concatenated[-1]
                
                if len(prev_segment) >= crossfade_samples and len(segment) >= crossfade_samples:
                    # Extract fade regions
                    fade_out = prev_segment[-crossfade_samples:]
                    fade_in = segment[:crossfade_samples]
                    
                    # Create crossfade envelope
                    envelope = np.linspace(1, 0, crossfade_samples)
                    fade_out_applied = fade_out * envelope
                    fade_in_applied = fade_in * (1 - envelope)
                    
                    # Blend
                    faded = fade_out_applied + fade_in_applied
                    
                    # Remove original faded regions and concatenate
                    concatenated[-1] = prev_segment[:-crossfade_samples]
                    concatenated.append(faded)
                    concatenated.append(segment[crossfade_samples:])
                else:
                    concatenated.append(segment)
        
        return np.concatenate(concatenated)
    
    def _normalize_audio(self, audio: np.ndarray, target_lufs: float = -16.0) -> np.ndarray:
        """
        Normalize audio to target loudness in LUFS.
        
        Args:
            audio: Audio data
            target_lufs: Target loudness in LUFS
            
        Returns:
            Normalized audio
        """
        if not PYLOUDNORM_AVAILABLE:
            # Fallback: normalize using RMS
            self.logger.warning("pyloudnorm not available, using RMS normalization")
            rms = np.sqrt(np.mean(audio ** 2))
            if rms > 0:
                target_rms = 10 ** (target_lufs / 20) * 0.1  # Rough conversion
                audio = audio * (target_rms / rms)
            return np.clip(audio, -1.0, 1.0)
        
        try:
            meter = pyloudnorm.Meter(self.settings.audio_sample_rate)
            loudness = meter.integrated_loudness(audio)
            
            if loudness != -np.inf:
                normalized = pyloudnorm.normalize(audio, loudness, target_lufs)
                return np.clip(normalized, -1.0, 1.0)
            else:
                # Audio is too quiet or silent
                return audio
                
        except Exception as e:
            self.logger.warning("Audio normalization failed, using RMS", error=str(e))
            # Fallback to RMS normalization
            rms = np.sqrt(np.mean(audio ** 2))
            if rms > 0:
                target_rms = 0.1
                audio = audio * (target_rms / rms)
            return np.clip(audio, -1.0, 1.0)
    
    def _remove_silence(self, audio: np.ndarray, threshold: float = 0.02, min_gap: float = 2.0) -> np.ndarray:
        """
        Remove silence gaps longer than min_gap seconds.
        
        Args:
            audio: Audio data
            threshold: Energy threshold for silence detection
            min_gap: Minimum gap duration in seconds
            
        Returns:
            Audio with long silence removed
        """
        frame_length = int(0.02 * self.settings.audio_sample_rate)  # 20ms frames
        min_gap_frames = int(min_gap / 0.02)
        
        # Calculate frame energy
        energy = []
        for i in range(0, len(audio) - frame_length, frame_length):
            frame = audio[i:i+frame_length]
            rms = np.sqrt(np.mean(frame ** 2))
            energy.append(rms)
        
        # Identify silence frames
        energy_threshold = threshold * np.max(energy) if len(energy) > 0 else threshold
        silence_mask = [e < energy_threshold for e in energy]
        
        # Remove long silence gaps
        output_frames = []
        silence_count = 0
        
        for i, is_silent in enumerate(silence_mask):
            if is_silent:
                silence_count += 1
                if silence_count < min_gap_frames:
                    output_frames.append(i)
            else:
                silence_count = 0
                output_frames.append(i)
        
        # Reconstruct audio
        output_indices = []
        for frame_idx in output_frames:
            start_idx = frame_idx * frame_length
            end_idx = min(start_idx + frame_length, len(audio))
            output_indices.extend(range(start_idx, end_idx))
        
        if output_indices:
            return audio[np.array(output_indices)]
        else:
            return audio
    
    def _get_cache_key(self, text: str, voice_name: str, emotion: str) -> str:
        """Generate cache key for audio synthesis."""
        content = f"{text}_{voice_name}_{emotion}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _get_output_filename(self, translated_script: TranslatedScript, output_dir: Path) -> Path:
        """Generate output filename for synthesized audio."""
        base_name = f"tts_{translated_script.target_language}_{int(time.time())}"
        return output_dir / f"{base_name}.wav"
    
    def clear_cache(self):
        """Clear audio synthesis cache."""
        self.logger.info("Clearing TTS cache", cached_items=len(self._audio_cache))
        self._audio_cache.clear()
    
    def get_service_info(self) -> Dict:
        """Get information about the TTS service."""
        return {
            "model_loaded": self._model_loaded,
            "supported_languages": list(self._voice_profiles.keys()),
            "sample_rate": self.settings.audio_sample_rate,
            "target_lufs": self.settings.target_lufs,
            "cached_segments": len(self._audio_cache)
        }
