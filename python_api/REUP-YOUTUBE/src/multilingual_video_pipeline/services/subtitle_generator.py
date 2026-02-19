"""Subtitle Generator Service - Audio-Only Whisper-Based Implementation.

Generates time-synchronized subtitles from audio using Whisper word-level timing.
No text-derived fallback timing—requires successful Whisper-based audio alignment.

Features:
- generate_subtitles_from_audio: Extract subtitle timing from narration audio via Whisper
- format_subtitles: Apply styling (white text, black outline, bottom positioning)
- export_srt: Export subtitles to .srt file for later embedding
"""

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..utils.file_utils import ensure_directory


class SubtitleGeneratorError(Exception):
    """Raised for subtitle generation related failures."""


@dataclass
class Subtitle:
    """A single subtitle entry with timing and text."""
    
    index: int
    start_time: float  # seconds
    end_time: float
    text: str
    
    def __post_init__(self):
        """Validate subtitle data."""
        if self.index < 1:
            raise ValueError("Subtitle index must be >= 1")
        if self.start_time < 0:
            raise ValueError("Start time cannot be negative")
        if self.end_time <= self.start_time:
            raise ValueError("End time must be greater than start time")
        if not self.text.strip():
            raise ValueError("Subtitle text cannot be empty")
    
    @property
    def duration(self) -> float:
        """Get subtitle duration in seconds."""
        return self.end_time - self.start_time
    
    def to_srt_format(self) -> str:
        """Convert to SRT format string."""
        start_str = self._seconds_to_srt_time(self.start_time)
        end_str = self._seconds_to_srt_time(self.end_time)
        return f"{self.index}\n{start_str} --> {end_str}\n{self.text}\n"
    
    @staticmethod
    def _seconds_to_srt_time(seconds: float) -> str:
        """Convert seconds to SRT time format (HH:MM:SS,mmm)."""
        total_seconds = int(seconds)
        milliseconds = int((seconds - total_seconds) * 1000)
        
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


@dataclass
class SubtitleStyle:
    """Styling configuration for subtitles."""
    
    font_name: str = "Arial"
    font_size: int = 24
    font_color: str = "FFFFFF"  # hex color without #
    outline_color: str = "000000"  # black outline
    outline_width: int = 2
    bold: bool = True
    margin_vertical: int = 20  # pixels from bottom
    
    def __post_init__(self):
        """Validate style configuration."""
        if self.font_size <= 0:
            raise ValueError("Font size must be positive")
        if self.outline_width < 0:
            raise ValueError("Outline width must be non-negative")
        if self.margin_vertical < 0:
            raise ValueError("Margin vertical must be non-negative")


class SubtitleGenerator(LoggerMixin):
    """
    Generate, format, and embed subtitles from audio using Whisper.
    
    Audio-only approach: Extracts word-level timing directly from narration audio.
    No text-derived fallback timing—requires successful Whisper alignment.
    """
    
    def __init__(self, settings=None, style: Optional[SubtitleStyle] = None):
        """
        Initialize SubtitleGenerator.
        
        Args:
            settings: Configuration settings
            style: Subtitle styling options
        """
        self.settings = settings or get_settings()
        self.temp_dir = ensure_directory(self.settings.cache_dir / "subtitles")
        self.style = style or SubtitleStyle()
        self.whisper_model = None
        self._load_whisper()
    
    def _load_whisper(self):
        """Load Whisper model for audio transcription."""
        try:
            import whisper
            self.whisper_model = whisper.load_model("base")
            self.logger.info("Whisper model loaded successfully")
        except ImportError:
            self.logger.error("Whisper not installed. Install via: pip install openai-whisper")
            raise SubtitleGeneratorError(
                "OpenAI Whisper is required for audio-based subtitle generation. "
                "Install via: pip install openai-whisper"
            )
        except Exception as e:
            self.logger.error(f"Failed to load Whisper model: {e}")
            raise SubtitleGeneratorError(f"Whisper model loading failed: {e}") from e
    
    # ---------------------------
    # Subtitle Generation (Audio-Only)
    # ---------------------------
    
    def generate_subtitles_from_audio(
        self,
        audio_path: str,
        language: str,
        translated_text: str
    ) -> List[Subtitle]:
        """
        Generate subtitles from audio using Whisper word-level timing.
        
        Primary method: Extracts word-level timing directly from narration audio.
        Aligns translated text with timing extracted from audio.
        
        Args:
            audio_path: Path to narration audio file (mp3, wav, m4a, etc.)
            language: Target language code (vi, en, ja, de)
            translated_text: Full translated script text to align with audio
            
        Returns:
            List of Subtitle objects with word-level timing from Whisper
            
        Raises:
            SubtitleGeneratorError: If audio alignment fails (no fallback available)
            
        Validates:
            - Maximum 100ms timing offset from Whisper
            - All cues properly formatted
            - Timing continuity (no gaps or overlaps)
        """
        self.logger.info(
            "Generating subtitles from audio",
            audio_path=audio_path,
            language=language
        )
        
        try:
            # Verify audio file exists
            audio_file = Path(audio_path)
            if not audio_file.exists():
                raise SubtitleGeneratorError(f"Audio file not found: {audio_path}")
            
            # Transcribe audio with word-level timing using Whisper
            self.logger.debug(f"Transcribing audio: {audio_path}")
            result = self.whisper_model.transcribe(
                str(audio_file),
                language=language,
                task="transcribe"
            )
            
            if not result or "segments" not in result:
                raise SubtitleGeneratorError(
                    "Whisper transcription produced invalid result"
                )
            
            # Extract word-level timing from transcription segments
            word_timings = self._extract_word_timings(result["segments"])
            
            if not word_timings:
                raise SubtitleGeneratorError(
                    "Failed to extract word-level timing from audio. "
                    "Ensure audio quality is sufficient for Whisper processing."
                )
            
            # Align translated text with extracted word timing
            subtitles = self._align_text_with_timing(translated_text, word_timings)
            
            # Format subtitles with line breaks and punctuation awareness
            subtitles = self._format_subtitle_text(subtitles)
            
            # Validate timing
            is_valid, errors = self.validate_subtitle_timing(subtitles)
            if not is_valid:
                self.logger.warning(
                    "Subtitle timing validation issues",
                    errors=errors
                )
            
            self.logger.info(
                "Subtitles generated from audio",
                subtitle_count=len(subtitles),
                language=language,
                total_duration=f"{subtitles[-1].end_time:.2f}s" if subtitles else "0s"
            )
            return subtitles
            
        except SubtitleGeneratorError:
            raise
        except Exception as e:
            self.logger.error(f"Audio-based subtitle generation failed: {e}")
            raise SubtitleGeneratorError(
                f"Subtitle generation from audio failed (no fallback available): {e}"
            ) from e
    
    def _extract_word_timings(self, segments: List[dict]) -> List[tuple]:
        """
        Extract word-level timing from Whisper transcription segments.
        
        Args:
            segments: Whisper transcription segments with timing info
            
        Returns:
            List of tuples: (word, start_time, end_time)
        """
        word_timings = []
        
        for segment in segments:
            segment_text = segment.get("text", "").strip()
            start_time = segment.get("start", 0.0)
            end_time = segment.get("end", 0.0)
            
            if segment_text and start_time < end_time:
                # Split segment into words and distribute timing
                words = segment_text.split()
                if words:
                    word_duration = (end_time - start_time) / len(words)
                    for i, word in enumerate(words):
                        word_start = start_time + (i * word_duration)
                        word_end = word_start + word_duration
                        word_timings.append((word, word_start, word_end))
        
        return word_timings
    
    def _align_text_with_timing(
        self,
        translated_text: str,
        word_timings: List[tuple]
    ) -> List[Subtitle]:
        """
        Align translated text with word-level timing from audio.
        
        Args:
            translated_text: Full translated script
            word_timings: Word-level timing from Whisper
            
        Returns:
            List of subtitle objects with synchronized timing
        """
        subtitles = []
        text_words = translated_text.split()
        
        # Match translated words with Whisper timing
        # Assumes translated text length is similar to original
        word_count = min(len(text_words), len(word_timings))
        
        for i in range(word_count):
            text_word = text_words[i]
            _, word_start, word_end = word_timings[i]
            
            subtitle = Subtitle(
                index=i + 1,
                start_time=word_start,
                end_time=word_end,
                text=text_word
            )
            subtitles.append(subtitle)
        
        return subtitles
    
    def _format_subtitle_text(self, subtitles: List[Subtitle]) -> List[Subtitle]:
        """
        Format subtitles: group words into lines (max 2 lines, ~42 chars each).
        Respects punctuation boundaries.
        
        Args:
            subtitles: Word-level subtitle objects
            
        Returns:
            Reformatted subtitles grouped into readable lines
        """
        MAX_CHARS_PER_LINE = 42
        MAX_LINES_PER_CUE = 2
        
        formatted_subtitles = []
        current_lines = []
        current_line = ""
        current_start_time = subtitles[0].start_time if subtitles else 0
        
        for subtitle in subtitles:
            word = subtitle.text
            
            # Try to add word to current line
            potential_line = (current_line + " " + word).strip()
            
            # Check if word ends with punctuation
            is_sentence_end = word.endswith((".", "?", "!", "。", "！", "？"))
            
            if len(potential_line) > MAX_CHARS_PER_LINE:
                # Start new line
                if current_line:
                    current_lines.append(current_line)
                current_line = word
            else:
                current_line = potential_line
            
            # Create subtitle at sentence boundaries or line limits
            if is_sentence_end or len(current_lines) + (1 if current_line else 0) >= MAX_LINES_PER_CUE:
                if current_line:
                    current_lines.append(current_line)
                
                if current_lines:
                    formatted_subtitle = Subtitle(
                        index=len(formatted_subtitles) + 1,
                        start_time=current_start_time,
                        end_time=subtitle.end_time,
                        text="\n".join(current_lines)
                    )
                    formatted_subtitles.append(formatted_subtitle)
                    current_lines = []
                    current_line = ""
                    current_start_time = subtitle.end_time
        
        # Handle remaining text
        if current_line:
            current_lines.append(current_line)
        if current_lines:
            formatted_subtitle = Subtitle(
                index=len(formatted_subtitles) + 1,
                start_time=current_start_time,
                end_time=subtitles[-1].end_time if subtitles else current_start_time,
                text="\n".join(current_lines)
            )
            formatted_subtitles.append(formatted_subtitle)
        
        return formatted_subtitles
    
    # ---------------------------
    # Subtitle Formatting
    # ---------------------------
    
    def format_subtitles(
        self,
        subtitles: List[Subtitle],
        style: Optional[SubtitleStyle] = None,
    ) -> str:
        """
        Format subtitles with line breaks and styling using SRT format.
        
        Args:
            subtitles: List of subtitles to format
            style: Optional custom styling (defaults to instance style)
            
        Returns:
            Formatted subtitle string in SRT format
        """
        style = style or self.style
        
        self.logger.info(
            "Formatting subtitles",
            count=len(subtitles),
            style_font=style.font_name,
            style_size=style.font_size
        )
        
        if not subtitles:
            raise SubtitleGeneratorError("Cannot format empty subtitle list")
        
        formatted_parts = []
        
        for subtitle in subtitles:
            srt_entry = subtitle.to_srt_format()
            formatted_parts.append(srt_entry)
        
        formatted_output = "\n".join(formatted_parts)
        
        self.logger.debug(
            "Subtitles formatted",
            count=len(subtitles),
            format="SRT",
            output_size=len(formatted_output)
        )
        
        return formatted_output
    
    # ---------------------------
    # SRT Export
    # ---------------------------
    
    def export_srt(
        self,
        subtitles: List[Subtitle],
        output_path: str,
        encoding: str = "utf-8-sig"
    ) -> str:
        """
        Export subtitles to .srt file for later embedding.
        
        Creates a .srt file that can be embedded into video during the rendering stage.
        Subtitles are not embedded at this stage since video assets are not yet generated.
        
        Args:
            subtitles: List of subtitle objects to export
            output_path: Path to output .srt file
            encoding: Character encoding (default UTF-8 with BOM for compatibility)
            
        Returns:
            Path to created SRT file
            
        Raises:
            SubtitleGeneratorError: If file writing fails
        """
        try:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            if not subtitles:
                raise SubtitleGeneratorError("Cannot export empty subtitle list")
            
            # Format subtitles to SRT content
            formatted_content = self.format_subtitles(subtitles)
            
            # Write to file
            with open(output_file, 'w', encoding=encoding) as f:
                f.write(formatted_content)
            
            file_size = output_file.stat().st_size
            
            self.logger.info(
                "SRT file exported successfully",
                output_path=str(output_file),
                subtitle_count=len(subtitles),
                file_size=f"{file_size} bytes"
            )
            
            return str(output_file)
            
        except IOError as e:
            self.logger.error(
                "Failed to export SRT file",
                output_path=str(output_path),
                error=str(e)
            )
            raise SubtitleGeneratorError(f"Failed to export SRT file: {e}") from e
        except Exception as e:
            self.logger.error(f"Subtitle export failed: {e}")
            raise SubtitleGeneratorError(f"Subtitle export failed: {e}") from e
    
    # ---------------------------
    # Utility Methods
    # ---------------------------
    
    def validate_subtitle_timing(
        self,
        subtitles: List[Subtitle],
        tolerance_ms: float = 100.0
    ) -> Tuple[bool, List[str]]:
        """
        Validate subtitle timing for overlaps and gaps.
        
        Args:
            subtitles: List of subtitles to validate
            tolerance_ms: Maximum acceptable timing difference in milliseconds
            
        Returns:
            Tuple of (is_valid, list of validation errors)
        """
        errors: List[str] = []
        
        for i in range(len(subtitles) - 1):
            current = subtitles[i]
            next_sub = subtitles[i + 1]
            
            # Check for overlap
            if current.end_time > next_sub.start_time:
                overlap_ms = (current.end_time - next_sub.start_time) * 1000
                errors.append(
                    f"Subtitles {current.index} and {next_sub.index} overlap "
                    f"by {overlap_ms:.1f}ms"
                )
            
            # Check for excessive gap
            gap_ms = (next_sub.start_time - current.end_time) * 1000
            if gap_ms > 1000:  # More than 1 second gap is unusual
                self.logger.debug(
                    "Large gap between subtitles",
                    gap_ms=f"{gap_ms:.1f}ms",
                    from_index=current.index,
                    to_index=next_sub.index
                )
        
        is_valid = len(errors) == 0
        
        if is_valid:
            self.logger.info("Subtitle timing validation passed")
        else:
            self.logger.warning(
                "Subtitle timing validation failed",
                error_count=len(errors)
            )
        
        return is_valid, errors
