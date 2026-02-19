"""
Translation Service for converting transcripts between languages.

This service translates transcripts from the source language to multiple target languages
using the Tencent HY-MT1.5-1.8B-FP8 model for high-quality translation.
"""

import time
import hashlib
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from ..models import Transcript, TranscriptSegment, TranslatedScript
from ..config import get_settings
from ..logging_config import LoggerMixin

try:
    from transformers import AutoTokenizer, AutoModelForCausalLM
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False


class TranslationError(Exception):
    """Exception raised during translation."""
    pass


@dataclass
class TranslationQuality:
    """Quality assessment for a translation."""
    score: float  # 0-1 scale
    fluency: float  # 0-1 scale
    accuracy: float  # 0-1 scale
    naturalness: float  # 0-1 scale
    duration_ratio: float
    flags: List[str]  # Issues found
    
    @property
    def is_acceptable(self) -> bool:
        """Check if translation quality is acceptable."""
        return (
            self.score >= 0.7 and
            0.8 <= self.duration_ratio <= 1.2 and
            len([f for f in self.flags if f.startswith("CRITICAL")]) == 0
        )


class TranslationService(LoggerMixin):
    """
    Service for translating transcripts using Tencent HY-MT1.5-1.8B-GPTQ-Int4 model.
    
    Features:
    - High-quality neural machine translation
    - Context-aware translation preserving meaning and tone
    - Natural speech pattern adjustments for narration
    - Duration validation (20% variance threshold)
    - Quality scoring and automatic flagging
    - Support for multiple target languages (Vietnamese, Japanese, German, English)
    - Caching to avoid redundant translations
    """
    
    def __init__(self, settings=None):
        """
        Initialize the Translation Service.
        
        Args:
            settings: Optional settings override
        """
        self.settings = settings or get_settings()
        self._translation_cache = {}
        self._model = None
        self._tokenizer = None
        self._model_loaded = False
        self._current_device = None
        
        # Check if transformers is available
        if not TRANSFORMERS_AVAILABLE:
            self.logger.error("Transformers library not available. Install with: pip install transformers torch accelerate auto-gptq")
            raise TranslationError("Transformers library required but not installed")
        
        self.logger.info("Translation Service initialized",
                        model_path=self.settings.translation_model_path,
                        target_languages=self.settings.target_languages,
                        device=self.settings.translation_device)
    
    def save_translation(self, translated_script: TranslatedScript, output_dir: Path) -> Path:
        """
        Save translated script to JSON file in output directory.
        
        Args:
            translated_script: TranslatedScript object to save
            output_dir: Directory to save the translation file
            
        Returns:
            Path to saved translation file
            
        Raises:
            TranslationError: If save operation fails
        """
        try:
            from ..utils.file_utils import ensure_directory
            import json
            
            output_dir = Path(output_dir)
            ensure_directory(output_dir)
            
            # Create filename with target language
            filename = f"translation_{translated_script.target_language}.json"
            translation_path = output_dir / filename
            
            # Serialize translation to JSON using the canonical schema expected by TranslatedScript
            translation_data = translated_script.to_dict()
            
            with open(translation_path, 'w', encoding='utf-8') as f:
                json.dump(translation_data, f, ensure_ascii=False, indent=2)
            
            self.logger.info(
                "Translation saved to output directory",
                language=translated_script.target_language,
                path=str(translation_path),
                segments=len(translated_script.translated_segments)
            )
            
            return translation_path
            
        except Exception as e:
            self.logger.error(
                "Failed to save translation",
                error=str(e),
                output_dir=str(output_dir)
            )
            raise TranslationError(f"Failed to save translation: {e}")
    
    def _load_model(self):
        """Load the Tencent HY-MT translation model."""
        if self._model_loaded:
            return
        
        try:
            self.logger.info("Loading Tencent HY-MT translation model",
                           model_path=self.settings.translation_model_path,
                           device=self.settings.translation_device)
            
            start_time = time.time()
            
            # Load tokenizer
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.settings.translation_model_path,
                trust_remote_code=True
            )
            
            # Load model - use device_map="auto" for automatic device placement
            self._model = AutoModelForCausalLM.from_pretrained(
                self.settings.translation_model_path,
                device_map="auto",
                trust_remote_code=True
            )
            
            self._model.eval()
            self._model_loaded = True
            self._current_device = next(self._model.parameters()).device
            
            load_time = time.time() - start_time
            self.logger.info("Translation model loaded successfully",
                           load_time_seconds=round(load_time, 2),
                           device=str(self._current_device))
            
        except Exception as e:
            self.logger.error("Failed to load translation model",
                            error=str(e),
                            model_path=self.settings.translation_model_path)
            raise TranslationError(f"Failed to load translation model: {e}")
    
    def translate_script(
        self,
        transcript: Transcript,
        target_language: str,
        preserve_emotion: bool = True,
        adjust_for_narration: bool = True,
        output_dir: Optional[Path] = None
    ) -> TranslatedScript:
        """
        Translate transcript to target language.
        
        Args:
            transcript: Source transcript to translate
            target_language: Target language code ('vi', 'ja', 'de', 'en')
            preserve_emotion: Whether to preserve emotional tone
            adjust_for_narration: Whether to adjust for natural narration speech
            output_dir: Optional directory to save translation debug output
            
        Returns:
            TranslatedScript with translated segments and quality metrics
            
        Raises:
            TranslationError: If translation fails
        """
        if target_language not in self.settings.target_languages:
            raise TranslationError(f"Unsupported target language: {target_language}")
        
        # Load model if not already loaded
        self._load_model()
        
        self.logger.info("Starting translation",
                        source_language=transcript.language,
                        target_language=target_language,
                        segments=len(transcript.segments))
        
        start_time = time.time()
        
        # Check cache
        cache_key = self._get_cache_key(transcript, target_language)
        if cache_key in self._translation_cache:
            self.logger.info("Using cached translation", cache_key=cache_key)
            return self._translation_cache[cache_key]
        
        try:
            # Translate each segment
            translated_segments = []
            for i, segment in enumerate(transcript.segments):
                translated_text = self._translate_segment(
                    text=segment.text,
                    source_language=transcript.language,
                    target_language=target_language,
                    context=self._get_context(transcript, i),
                    preserve_emotion=preserve_emotion,
                    adjust_for_narration=adjust_for_narration
                )
                
                # Create translated segment with similar timing
                translated_segments.append(TranscriptSegment(
                    text=translated_text,
                    start_time=segment.start_time,
                    end_time=segment.end_time,
                    confidence=segment.confidence * 0.95  # Slightly lower for translation
                ))
            
            # Calculate duration ratio
            duration_ratio = self._calculate_duration_ratio(transcript.segments, translated_segments)
            if not self.validate_duration(duration_ratio):
                self.logger.warning("Translation duration variance exceeds 20%",
                                  duration_ratio=duration_ratio,
                                  source_language=transcript.language,
                                  target_language=target_language)
            
            # Create translated script
            translated_script = TranslatedScript(
                original=transcript,
                translated_segments=translated_segments,
                target_language=target_language,
                duration_ratio=duration_ratio
            )
            
            # Assess quality
            quality = self.assess_quality(translated_script)
            
            duration = time.time() - start_time
            
            self.logger.info("Translation completed",
                           source_language=transcript.language,
                           target_language=target_language,
                           segments=len(translated_segments),
                           duration_seconds=duration,
                           duration_ratio=duration_ratio,
                           quality_score=quality.score,
                           quality_acceptable=quality.is_acceptable)
            
            # Save translation debug output
            if output_dir:
                self._save_translation_debug(translated_script, output_dir, target_language)
            
            # Cache the result
            self._translation_cache[cache_key] = translated_script
            
            return translated_script
            
        except Exception as e:
            self.logger.error("Translation failed",
                            source_language=transcript.language,
                            target_language=target_language,
                            error=str(e))
            raise TranslationError(f"Failed to translate: {str(e)}")
    
    def _save_translation_debug(self, translated_script: TranslatedScript, output_dir: Path, target_language: str) -> None:
        """Save translation results to debug file."""
        try:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            debug_file = output_dir / f"translation_debug_{target_language}.txt"
            
            with open(debug_file, 'w', encoding='utf-8') as f:
                f.write("="*80 + "\n")
                f.write(f"TRANSLATION DEBUG OUTPUT - {target_language.upper()}\n")
                f.write("="*80 + "\n\n")
                
                f.write(f"Source Language: {translated_script.original.language}\n")
                f.write(f"Target Language: {translated_script.target_language}\n")
                f.write(f"Total Segments: {len(translated_script.translated_segments)}\n")
                f.write(f"Duration Ratio: {translated_script.duration_ratio:.3f}\n")
                f.write("\n")
                
                # Original transcript
                f.write("="*80 + "\n")
                f.write("ORIGINAL TRANSCRIPT\n")
                f.write("="*80 + "\n\n")
                
                for i, segment in enumerate(translated_script.original.segments):
                    f.write(f"[Segment {i+1}]\n")
                    f.write(f"Time: {segment.start_time:.2f}s - {segment.end_time:.2f}s (Duration: {segment.duration:.2f}s)\n")
                    f.write(f"Confidence: {segment.confidence:.3f}\n")
                    f.write(f"Text: {segment.text}\n")
                    f.write("\n")
                
                # Translated transcript
                f.write("="*80 + "\n")
                f.write(f"TRANSLATED TRANSCRIPT ({target_language.upper()})\n")
                f.write("="*80 + "\n\n")
                
                for i, segment in enumerate(translated_script.translated_segments):
                    f.write(f"[Segment {i+1}]\n")
                    f.write(f"Time: {segment.start_time:.2f}s - {segment.end_time:.2f}s (Duration: {segment.duration:.2f}s)\n")
                    f.write(f"Confidence: {segment.confidence:.3f}\n")
                    f.write(f"Text: {segment.text}\n")
                    f.write("\n")
                
                # Full text comparison
                f.write("="*80 + "\n")
                f.write("FULL TEXT COMPARISON\n")
                f.write("="*80 + "\n\n")
                
                original_full_text = " ".join(seg.text for seg in translated_script.original.segments)
                translated_full_text = " ".join(seg.text for seg in translated_script.translated_segments)
                
                f.write(f"Original ({translated_script.original.language}):\n")
                f.write(original_full_text + "\n\n")
                
                f.write(f"Translated ({target_language}):\n")
                f.write(translated_full_text + "\n\n")
            
            self.logger.info(f"Translation debug output saved", output_file=str(debug_file))
            
        except Exception as e:
            self.logger.error(f"Failed to save translation debug output: {e}")
    
    def _translate_segment(
        self,
        text: str,
        source_language: str,
        target_language: str,
        context: str = "",
        preserve_emotion: bool = True,
        adjust_for_narration: bool = True
    ) -> str:
        """
        Translate a single text segment using Tencent HY-MT model.
        
        Args:
            text: Text to translate
            source_language: Source language code
            target_language: Target language code
            context: Surrounding context for better translation
            preserve_emotion: Whether to preserve emotional tone
            adjust_for_narration: Whether to adjust for narration
            
        Returns:
            Translated text
        """
        if not text or not text.strip():
            return text
        
        try:
            # Build translation prompt content
            content = self._build_translation_prompt(
                text=text,
                source_language=source_language,
                target_language=target_language,
                context=context,
                preserve_emotion=preserve_emotion,
                adjust_for_narration=adjust_for_narration
            )
            
            # Use chat template for message formatting
            messages = [{"role": "user", "content": content}]
            
            tokenized_chat = self._tokenizer.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_tensors="pt"
            )
            
            # Move to model device
            tokenized_chat = tokenized_chat.to(self._current_device)
            
            # Generate translation with recommended parameters
            with torch.no_grad():
                outputs = self._model.generate(
                    tokenized_chat,
                    max_new_tokens=512,
                    temperature=0.7,
                    top_p=0.6,
                    top_k=20,
                    repetition_penalty=1.05,
                    do_sample=True,
                    pad_token_id=self._tokenizer.pad_token_id,
                    eos_token_id=self._tokenizer.eos_token_id
                )
            
            # Decode output
            full_output = self._tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract translation from response
            translated_text = self._extract_translation(full_output)
            
            # Clean up the output
            translated_text = self._clean_translation(translated_text)
            
            if not translated_text:
                self.logger.warning("Empty translation generated, using original text",
                                  original=text)
                return text
            
            return translated_text
            
        except Exception as e:
            self.logger.error("Translation generation failed",
                            error=str(e),
                            text=text)
            raise TranslationError(f"Translation generation failed: {str(e)}")
    
    def _clean_translation(self, text: str) -> str:
        """Clean up translated text."""
        # Remove extra whitespace
        text = " ".join(text.split())
        
        # Remove common artifacts
        text = text.strip('"\'"')
        
        return text.strip()
    
    def _extract_translation(self, full_output: str) -> str:
        """Extract the translated text from model output."""
        text = full_output.replace('\r', '')

        # Prefer everything after the final "Translation in <lang>:" marker
        match = re.split(r"translation in [a-z]+:\s*", text, flags=re.IGNORECASE)
        if len(match) > 1:
            text = match[-1]

        # Drop common prompt/instruction lines that leak into the output
        skip_keywords = (
            "translate the following",
            "text to translate",
            "context:",
            "preserve the emotional",
            "adjust the translation",
            "use conversational language",
            "keep sentences concise",
            "do not add explanations",
            "maintain the approximate length",
            "output only the translated text",
        )

        lines = [line.strip() for line in text.split('\n') if line.strip()]
        filtered = [line for line in lines if not any(k in line.lower() for k in skip_keywords)]

        # If we still have multiple lines, join; otherwise fallback to last non-empty
        candidate_lines = filtered or lines
        if candidate_lines:
            return ' '.join(candidate_lines)

        return full_output.strip()
    
    def _build_translation_prompt(
        self,
        text: str,
        source_language: str,
        target_language: str,
        context: str,
        preserve_emotion: bool,
        adjust_for_narration: bool
    ) -> str:
        """Build translation prompt for LLM."""
        language_names = {
            'vi': 'Vietnamese',
            'ja': 'Japanese',
            'de': 'German',
            'en': 'English'
        }
        
        source_lang_name = language_names.get(source_language, source_language)
        target_lang_name = language_names.get(target_language, target_language)
        
        prompt_parts = [
            f"Translate the following {source_lang_name} text to {target_lang_name}.",
            ""
        ]
        
        if context:
            prompt_parts.append(f"Context: {context}")
            prompt_parts.append("")
        
        if preserve_emotion:
            prompt_parts.append("- Preserve the emotional tone and intensity of the original text.")
        
        if adjust_for_narration:
            prompt_parts.append("- Adjust the translation for natural spoken narration.")
            prompt_parts.append("- Use conversational language suitable for video voiceover.")
            prompt_parts.append("- Keep sentences concise and easy to speak.")
        
        prompt_parts.extend([
            "- Maintain the approximate length and pacing of the original.",
            "- Do not add explanations or notes.",
            "- Output only the translated text.",
            "",
            f"Text to translate:",
            text,
            "",
            f"Translation in {target_lang_name}:"
        ])
        
        return "\n".join(prompt_parts)
    
    def _get_context(self, transcript: Transcript, segment_index: int, window: int = 1) -> str:
        """Get surrounding context for a segment."""
        context_segments = []
        
        # Get previous segments
        start_idx = max(0, segment_index - window)
        for i in range(start_idx, segment_index):
            context_segments.append(transcript.segments[i].text)
        
        # Get next segments
        end_idx = min(len(transcript.segments), segment_index + window + 1)
        for i in range(segment_index + 1, end_idx):
            context_segments.append(transcript.segments[i].text)
        
        return " ".join(context_segments)
    
    def _calculate_duration_ratio(
        self,
        original_segments: List[TranscriptSegment],
        translated_segments: List[TranscriptSegment]
    ) -> float:
        """Calculate duration ratio between original and translated segments."""
        original_duration = sum(seg.duration for seg in original_segments)
        translated_duration = sum(seg.duration for seg in translated_segments)
        
        if original_duration == 0:
            return 1.0
        
        return translated_duration / original_duration
    
    def validate_duration(self, duration_ratio: float, threshold: float = 0.2) -> bool:
        """
        Validate that duration ratio is within acceptable range.
        
        Args:
            duration_ratio: Ratio of translated duration to original duration
            threshold: Maximum allowed deviation (default 20%)
            
        Returns:
            True if duration is acceptable
        """
        min_ratio = 1.0 - threshold
        max_ratio = 1.0 + threshold
        
        return min_ratio <= duration_ratio <= max_ratio
    
    def assess_quality(self, translated_script: TranslatedScript) -> TranslationQuality:
        """
        Assess translation quality using heuristics.
        
        Args:
            translated_script: Translated script to assess
            
        Returns:
            TranslationQuality with scores and flags
        """
        flags = []
        
        # Check duration variance
        duration_ratio = translated_script.duration_ratio
        if not self.validate_duration(duration_ratio):
            if duration_ratio < 0.8:
                flags.append("CRITICAL: Translation too short (>20% shorter)")
            elif duration_ratio > 1.2:
                flags.append("CRITICAL: Translation too long (>20% longer)")
            else:
                flags.append("WARNING: Duration variance detected")
        
        # Check for empty segments
        empty_segments = sum(1 for seg in translated_script.translated_segments if not seg.text.strip())
        if empty_segments > 0:
            flags.append(f"CRITICAL: {empty_segments} empty translated segments")
        
        # Check segment count match
        if len(translated_script.translated_segments) != len(translated_script.original.segments):
            flags.append(f"CRITICAL: Segment count mismatch")
        
        # Calculate heuristic scores
        # Fluency: Based on duration consistency
        fluency_score = 1.0 - min(abs(duration_ratio - 1.0) / 0.2, 1.0)
        
        # Accuracy: Assume high if no critical errors
        accuracy_score = 0.95 if not any(f.startswith("CRITICAL") for f in flags) else 0.5
        
        # Naturalness: Based on average segment length
        avg_segment_length = sum(len(seg.text) for seg in translated_script.translated_segments) / max(len(translated_script.translated_segments), 1)
        naturalness_score = min(avg_segment_length / 100, 1.0)  # Optimal around 100 chars
        
        # Overall score
        overall_score = (fluency_score + accuracy_score + naturalness_score) / 3
        
        return TranslationQuality(
            score=overall_score,
            fluency=fluency_score,
            accuracy=accuracy_score,
            naturalness=naturalness_score,
            duration_ratio=duration_ratio,
            flags=flags
        )
    
    def _get_cache_key(self, transcript: Transcript, target_language: str) -> str:
        """Generate cache key for translation."""
        # Use hash of full text + target language
        text_hash = hashlib.md5(transcript.full_text.encode()).hexdigest()
        return f"{transcript.language}_{target_language}_{text_hash}"
    
    def clear_cache(self):
        """Clear translation cache."""
        self.logger.info("Clearing translation cache", cached_items=len(self._translation_cache))
        self._translation_cache.clear()
    
    def get_service_info(self) -> Dict[str, Any]:
        """Get information about the translation service."""
        return {
            "model_loaded": self._model_loaded,
            "model_path": self.settings.translation_model_path,
            "device": self.settings.translation_device,
            "target_languages": self.settings.target_languages,
            "cached_translations": len(self._translation_cache)
        }
