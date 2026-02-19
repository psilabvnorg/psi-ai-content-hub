"""
Transcription Service for converting audio to text via whisper-stt API.
"""

import os
import re
import time
import json
from pathlib import Path
from typing import List, Optional, Dict, Any, Union
from enum import Enum

from ..models import Transcript, TranscriptSegment, TranscriptionModel
from ..config import get_settings
from ..logging_config import LoggerMixin
from ..utils.file_utils import ensure_directory, get_file_size
from .api_client import ApiClient


class TranscriptionError(Exception):
    """Exception raised during transcription."""
    pass


class ModelLoadError(Exception):
    """Exception raised when model loading fails."""
    pass


class TranscriptionService(LoggerMixin):
    """
    Service for transcribing audio files via whisper-stt API.
    
    Stage-level execution in the migrated pipeline is API-only.
    """
    
    def __init__(self, settings=None, use_api: bool = True, api_client: Optional[ApiClient] = None):
        """
        Initialize the Transcription Service.
        
        Args:
            settings: Optional settings override
            use_api: API mode switch. This service is API-only in migrated pipeline.
            api_client: Shared API client instance
        """
        self.settings = settings or get_settings()
        self.use_api = bool(use_api and getattr(self.settings, "use_api_services", True))
        if not self.use_api:
            raise TranscriptionError(
                "TranscriptionService is API-only. Enable settings.use_api_services and pass use_api=True."
            )
        self.api_client = api_client or ApiClient(self.settings)
        self._models = {}  # Model cache
        self._model_loading_lock = {}  # Prevent concurrent model loading

        # Legacy local-model attributes retained for compatibility with helper APIs.
        self._whisper_available = False
        self._phowhisper_available = False
        self._faster_whisper_available = False
        self._gpu_available = False
        self._punctuation_available = False
        
        self.logger.info("Transcription Service initialized",
                        cache_dir=str(self.settings.cache_dir),
                        gpu_available=self._gpu_available,
                        use_api=self.use_api)
    
    def _check_dependencies(self):
        """Check if required transcription libraries are available."""
        self._whisper_available = False
        self._phowhisper_available = False
        self._faster_whisper_available = False
        self._gpu_available = False
        self._punctuation_available = False
        
        # Check OpenAI Whisper
        try:
            import whisper
            self._whisper_available = True
            self.logger.info("OpenAI Whisper available")
        except ImportError:
            self.logger.warning("OpenAI Whisper not available. Install with: pip install openai-whisper")
        
        # Check faster-whisper (performance optimization)
        try:
            import faster_whisper
            self._faster_whisper_available = True
            self.logger.info("faster-whisper available (performance optimization)")
        except ImportError:
            self.logger.info("faster-whisper not available. Install with: pip install faster-whisper")
        
        # Check PhoWhisper for Vietnamese
        try:
            # PhoWhisper is accessed via HuggingFace transformers pipeline
            from transformers import pipeline
            # Check if PhoWhisper model path exists
            phowhisper_path = Path(getattr(self.settings, 'phowhisper_model_path', ''))
            if phowhisper_path.exists():
                self._phowhisper_available = True
                self._phowhisper_model_path = phowhisper_path
                self.logger.info("PhoWhisper available for Vietnamese", 
                               model_path=str(phowhisper_path))
            else:
                self._phowhisper_available = False
                self.logger.info("PhoWhisper model not found. Using Whisper for Vietnamese as fallback",
                               expected_path=str(phowhisper_path))
        except ImportError:
            self._phowhisper_available = False
            self.logger.info("transformers library not available. Install with: pip install transformers")
        
        # Check GPU availability
        try:
            import torch
            self._gpu_available = torch.cuda.is_available()
            if self._gpu_available:
                self.logger.info("GPU acceleration available", 
                               device_count=torch.cuda.device_count())
            else:
                self.logger.info("GPU not available, using CPU")
        except ImportError:
            self.logger.info("PyTorch not available, using CPU only")
        
        # Check punctuation restoration model
        try:
            from deepmultilingualpunctuation import PunctuationModel
            self._punctuation_available = True
            self.logger.info("Punctuation restoration available (deepmultilingualpunctuation)")
        except ImportError:
            self._punctuation_available = False
            self.logger.info("Punctuation restoration not available. Install with: pip install deepmultilingualpunctuation")
    
    def save_transcript(self, transcript: Transcript, output_dir: Path) -> Path:
        """
        Save transcript to a JSON file.
        
        Args:
            transcript: Transcript object to save
            output_dir: Directory where transcript file will be saved
            
        Returns:
            Path to the saved transcript file
            
        Raises:
            TranscriptionError: If transcript cannot be saved
        """
        try:
            output_dir = ensure_directory(output_dir)
            transcript_path = output_dir / "transcript.json"
            
            # Save using the transcript's built-in method
            transcript.save_to_file(transcript_path)
            
            self.logger.info("Transcript saved", path=str(transcript_path))
            return transcript_path
            
        except Exception as e:
            raise TranscriptionError(f"Failed to save transcript: {str(e)}")
    
    def transcribe_audio(self, audio_file: Path, language: str = "auto", restore_punctuation: bool = True) -> Transcript:
        """
        Transcribe audio file via whisper-stt API.
        
        Args:
            audio_file: Path to audio file
            language: Language code ('auto' for API-side detection, 'vi', 'ja', 'de', 'en')
            restore_punctuation: Whether to restore punctuation for better TTS quality
            
        Returns:
            Transcript object with segments and metadata
            
        Raises:
            TranscriptionError: If transcription fails
        """
        if not audio_file.exists():
            raise TranscriptionError(f"Audio file not found: {audio_file}")

        self.logger.info(
            "Starting transcription",
            audio_file=str(audio_file),
            language=language,
            file_size_mb=get_file_size(audio_file) / (1024 * 1024),
            use_api=self.use_api,
        )

        return self._transcribe_audio_api(audio_file, language, restore_punctuation)

    def _transcribe_audio_api(self, audio_file: Path, language: str, restore_punctuation: bool) -> Transcript:
        """API-backed transcription path using whisper-stt service."""
        form_data: Dict[str, str] = {
            "model": "large-v3",
            "add_punctuation": "true" if restore_punctuation else "false",
            "word_timestamps": "true",
        }
        if language and language != "auto":
            form_data["language"] = language

        with audio_file.open("rb") as stream:
            response = self.api_client.post_multipart(
                self.settings.whisper_api_url,
                "/api/v1/transcribe",
                data=form_data,
                files={"file": (audio_file.name, stream, "audio/wav")},
            )

        task_id = response.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            raise TranscriptionError("Invalid whisper-stt response: missing task_id")

        result = self.api_client.poll_for_completion(
            base_url=self.settings.whisper_api_url,
            task_id=task_id,
            stream_path="/api/v1/transcribe/stream",
            result_path="/api/v1/transcribe/result",
        )

        segments_payload = result.get("segments")
        if not isinstance(segments_payload, list):
            segments_payload = []

        segments: List[TranscriptSegment] = []
        for segment in segments_payload:
            if not isinstance(segment, dict):
                continue
            raw_start = segment.get("start")
            raw_end = segment.get("end")
            raw_text = segment.get("text")
            if not isinstance(raw_start, (int, float)):
                continue
            if not isinstance(raw_end, (int, float)):
                continue
            if not isinstance(raw_text, str) or not raw_text.strip():
                continue
            if float(raw_end) <= float(raw_start):
                continue

            words = segment.get("words")
            confidence = 0.95
            if isinstance(words, list) and words:
                probs = [
                    float(word.get("probability"))
                    for word in words
                    if isinstance(word, dict) and isinstance(word.get("probability"), (int, float))
                ]
                if probs:
                    confidence = max(0.0, min(1.0, sum(probs) / len(probs)))

            segments.append(
                TranscriptSegment(
                    text=raw_text.strip(),
                    start_time=float(raw_start),
                    end_time=float(raw_end),
                    confidence=confidence,
                    words=words if isinstance(words, list) else None,
                )
            )

        if not segments:
            raise TranscriptionError("whisper-stt returned no usable segments")

        full_text = result.get("text_with_punctuation") if restore_punctuation else result.get("text")
        if not isinstance(full_text, str) or not full_text.strip():
            full_text = " ".join(segment.text for segment in segments)

        transcript_language = result.get("language")
        if not isinstance(transcript_language, str) or not transcript_language:
            transcript_language = language if language != "auto" else "en"

        average_confidence = sum(segment.confidence for segment in segments) / len(segments)

        transcript = Transcript(
            segments=segments,
            language=transcript_language,
            full_text=full_text,
            transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
            model_confidence=max(0.0, min(1.0, average_confidence)),
        )

        self.logger.info(
            "Transcription completed via API",
            audio_file=str(audio_file),
            language=transcript.language,
            segments=len(transcript.segments),
            confidence=transcript.model_confidence,
        )
        return transcript
    
    def detect_language(self, audio_file: Path) -> str:
        """
        Detect the language of an audio file.
        
        Args:
            audio_file: Path to audio file
            
        Returns:
            Language code (vi, ja, de, en)
        """
        if not audio_file.exists():
            raise TranscriptionError(f"Audio file not found: {audio_file}")
        
        self.logger.info("Detecting audio language", audio_file=str(audio_file))
        
        try:
            # Use Whisper's built-in language detection
            if self._faster_whisper_available:
                model = self._get_faster_whisper_model("base")
                segments, info = model.transcribe(str(audio_file), language=None)
                detected_language = info.language
            elif self._whisper_available:
                model = self._get_whisper_model("base")
                # Load audio and detect language
                import whisper
                audio = whisper.load_audio(str(audio_file))
                audio = whisper.pad_or_trim(audio)
                mel = whisper.log_mel_spectrogram(audio).to(model.device)
                _, probs = model.detect_language(mel)
                detected_language = max(probs, key=probs.get)
            else:
                # Fallback to default if no models available
                self.logger.warning("No transcription models available for language detection")
                return "en"  # Default to English
            
            # Map to our target languages
            language_mapping = {
                'vi': 'vi',
                'ja': 'ja', 
                'de': 'de',
                'en': 'en',
                'zh': 'en',  # Default Chinese to English
                'ko': 'en',  # Default Korean to English
                'fr': 'en',  # Default French to English
                'es': 'en',  # Default Spanish to English
            }
            
            mapped_language = language_mapping.get(detected_language, 'en')
            
            self.logger.info("Language detected",
                           audio_file=str(audio_file),
                           detected=detected_language,
                           mapped=mapped_language)
            
            return mapped_language
            
        except Exception as e:
            self.logger.warning("Language detection failed, defaulting to English",
                              audio_file=str(audio_file),
                              error=str(e))
            return "en"
    
    def select_transcription_model(self, language: str) -> TranscriptionModel:
        """
        Select the appropriate transcription model for a language.
        
        Args:
            language: Language code
            
        Returns:
            TranscriptionModel enum value
        """
        if language == "vi" and self._phowhisper_available:
            return TranscriptionModel.PHOWHISPER
        else:
            return TranscriptionModel.WHISPER_MULTILINGUAL
    
    def segment_by_sentences(self, transcript: Transcript) -> List[TranscriptSegment]:
        """
        Segment transcript into sentence-based segments for scene boundaries.
        
        Args:
            transcript: Original transcript
            
        Returns:
            List of sentence-based segments
        """
        if not transcript.segments:
            return []
        
        # Simple sentence segmentation based on punctuation
        sentence_segments = []
        current_text = ""
        current_start = None
        current_end = None
        current_confidence_sum = 0
        segment_count = 0
        
        for segment in transcript.segments:
            if current_start is None:
                current_start = segment.start_time
            
            current_text += segment.text + " "
            current_end = segment.end_time
            current_confidence_sum += segment.confidence
            segment_count += 1
            
            # Check for sentence endings
            if self._is_sentence_end(segment.text):
                avg_confidence = current_confidence_sum / segment_count if segment_count > 0 else 0
                
                sentence_segments.append(TranscriptSegment(
                    text=current_text.strip(),
                    start_time=current_start,
                    end_time=current_end,
                    confidence=avg_confidence
                ))
                
                # Reset for next sentence
                current_text = ""
                current_start = None
                current_confidence_sum = 0
                segment_count = 0
        
        # Handle remaining text
        if current_text.strip():
            avg_confidence = current_confidence_sum / segment_count if segment_count > 0 else 0
            sentence_segments.append(TranscriptSegment(
                text=current_text.strip(),
                start_time=current_start,
                end_time=current_end,
                confidence=avg_confidence
            ))
        
        self.logger.debug("Segmented transcript by sentences",
                        original_segments=len(transcript.segments),
                        sentence_segments=len(sentence_segments))
        
        return sentence_segments
    
    def _is_sentence_end(self, text: str) -> bool:
        """Check if text ends with sentence-ending punctuation."""
        text = text.strip()
        if not text:
            return False
        
        # Common sentence endings in multiple languages
        sentence_endings = ['.', '!', '?', '。', '！', '？', '．']
        return any(text.endswith(ending) for ending in sentence_endings)
    
    def _transcribe_vietnamese(self, audio_file: Path) -> Transcript:
        """
        Transcribe Vietnamese audio using PhoWhisper with fallback to Whisper.
        
        Args:
            audio_file: Path to audio file
            
        Returns:
            Transcript object
        """
        self.logger.info("Transcribing Vietnamese audio", audio_file=str(audio_file))
        
        # Try PhoWhisper first
        if self._phowhisper_available:
            try:
                return self._transcribe_with_phowhisper(audio_file)
            except Exception as e:
                self.logger.warning("PhoWhisper transcription failed, falling back to Whisper",
                                  audio_file=str(audio_file),
                                  error=str(e))
        
        # Fallback to Whisper for Vietnamese
        return self._transcribe_multilingual(audio_file, "vi")
    
    def _transcribe_multilingual(self, audio_file: Path, language: str) -> Transcript:
        """
        Transcribe audio using OpenAI Whisper (or faster-whisper).
        
        Args:
            audio_file: Path to audio file
            language: Language code
            
        Returns:
            Transcript object
        """
        self.logger.info("Transcribing with Whisper",
                        audio_file=str(audio_file),
                        language=language)
        
        if self._faster_whisper_available:
            return self._transcribe_with_faster_whisper(audio_file, language)
        elif self._whisper_available:
            return self._transcribe_with_whisper(audio_file, language)
        else:
            raise TranscriptionError("No Whisper models available")
    
    def _transcribe_with_phowhisper(self, audio_file: Path) -> Transcript:
        """Transcribe using PhoWhisper model via HuggingFace transformers."""
        try:
            from transformers import pipeline
            
            self.logger.info("Using PhoWhisper for Vietnamese transcription",
                           audio_file=str(audio_file),
                           model_path=str(self._phowhisper_model_path))
            
            # Load PhoWhisper pipeline with word-level timestamps
            cache_key = "phowhisper_pipeline"
            if cache_key not in self._models:
                self.logger.info("Loading PhoWhisper pipeline")
                pipe = pipeline(
                    "automatic-speech-recognition",
                    model=str(self._phowhisper_model_path),
                    chunk_length_s=30,
                    return_timestamps="word"
                )
                self._models[cache_key] = pipe
                self.logger.info("PhoWhisper pipeline loaded successfully")
            else:
                pipe = self._models[cache_key]
            
            # Transcribe with word timestamps
            self.logger.info("Transcribing with PhoWhisper...")
            result = pipe(str(audio_file), return_timestamps="word")
            
            # Extract text and chunks
            full_text = result.get('text', '').strip()
            chunks = result.get('chunks', [])
            
            if not chunks:
                raise TranscriptionError("No speech detected in audio")
            
            # Convert chunks to segments (group by ~30 second intervals)
            segments = []
            current_segment = {'id': 0, 'words': [], 'text': ''}
            segment_start = None
            
            for i, chunk in enumerate(chunks):
                timestamp = chunk.get('timestamp', (0.0, 0.0))
                text = chunk.get('text', '').strip()
                
                # Handle timestamps
                if timestamp[0] is not None:
                    word_start = timestamp[0]
                else:
                    word_start = segments[-1]['end'] if segments else 0.0
                
                if timestamp[1] is not None:
                    word_end = timestamp[1]
                else:
                    word_end = word_start + 0.5
                
                if segment_start is None:
                    segment_start = word_start
                
                current_segment['text'] += text + ' '
                
                # Create new segment every ~30 seconds or at sentence boundaries
                if (word_end - segment_start > 30) or (i == len(chunks) - 1):
                    current_segment['start'] = segment_start
                    current_segment['end'] = word_end
                    current_segment['text'] = current_segment['text'].strip()
                    segments.append(current_segment)
                    
                    # Start new segment
                    current_segment = {'id': len(segments), 'words': [], 'text': ''}
                    segment_start = None
            
            # Convert to our TranscriptSegment format
            transcript_segments = []
            for seg in segments:
                if seg['text']:  # Only add non-empty segments
                    transcript_segments.append(TranscriptSegment(
                        text=seg['text'],
                        start_time=seg['start'],
                        end_time=seg['end'],
                        confidence=0.95  # PhoWhisper typically has high confidence for Vietnamese
                    ))
            
            if not transcript_segments:
                raise TranscriptionError("No valid segments after processing")
            
            duration = transcript_segments[-1].end_time if transcript_segments else 0
            avg_confidence = sum(seg.confidence for seg in transcript_segments) / len(transcript_segments)
            
            self.logger.info("PhoWhisper transcription completed",
                           segments=len(transcript_segments),
                           duration=duration,
                           confidence=avg_confidence)
            
            return Transcript(
                segments=transcript_segments,
                language="vi",
                full_text=full_text,
                transcription_model=TranscriptionModel.PHOWHISPER,
                model_confidence=avg_confidence
            )
            
        except ImportError as e:
            raise TranscriptionError(f"transformers library required for PhoWhisper: {str(e)}")
        except Exception as e:
            raise TranscriptionError(f"PhoWhisper transcription failed: {str(e)}")
    
    def _transcribe_with_faster_whisper(self, audio_file: Path, language: str) -> Transcript:
        """Transcribe using faster-whisper for performance."""
        try:
            model = self._get_faster_whisper_model("base")
            
            # Transcribe with faster-whisper
            segments_generator, info = model.transcribe(
                str(audio_file),
                language=language if language != "auto" else None,
                word_timestamps=True,
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Convert generator to list to force evaluation and populate word timestamps
            segments = list(segments_generator)
            self.logger.info(f"Transcribed {len(segments)} segments with faster-whisper")
            
            # Convert to our format
            transcript_segments = []
            for segment in segments:
                # Convert log probability to confidence (0-1 scale)
                # avg_logprob is typically negative, convert to positive confidence
                confidence = max(0.0, min(1.0, (segment.avg_logprob + 1.0)))
                
                # Extract word-level timing
                words_with_timing = []
                
                # Debug: Check if segment has words
                has_words_attr = hasattr(segment, 'words')
                words_value = getattr(segment, 'words', None) if has_words_attr else None
                
                self.logger.debug(f"Segment word extraction - hasattr: {has_words_attr}, words: {words_value is not None}, count: {len(words_value) if words_value else 0}")
                
                if hasattr(segment, 'words') and segment.words:
                    for word_info in segment.words:
                        words_with_timing.append({
                            'word': word_info.word.strip() if hasattr(word_info, 'word') else str(word_info).strip(),
                            'start': word_info.start if hasattr(word_info, 'start') else segment.start,
                            'end': word_info.end if hasattr(word_info, 'end') else segment.end
                        })
                    self.logger.debug(f"Extracted {len(words_with_timing)} words from segment")
                else:
                    self.logger.warning(f"No word timing in segment: {segment.text[:50]}")
                
                transcript_segments.append(TranscriptSegment(
                    text=segment.text.strip(),
                    start_time=segment.start,
                    end_time=segment.end,
                    confidence=confidence,
                    words=words_with_timing if words_with_timing else None
                ))
            
            if not transcript_segments:
                raise TranscriptionError("No speech detected in audio")
            
            full_text = " ".join(seg.text for seg in transcript_segments)
            avg_confidence = sum(seg.confidence for seg in transcript_segments) / len(transcript_segments)
            
            return Transcript(
                segments=transcript_segments,
                language=info.language,
                full_text=full_text,
                transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
                model_confidence=avg_confidence
            )
            
        except Exception as e:
            raise TranscriptionError(f"faster-whisper transcription failed: {str(e)}")
    
    def _transcribe_with_whisper(self, audio_file: Path, language: str, model_name: str = "base") -> Transcript:
        """Transcribe using OpenAI Whisper."""
        try:
            model = self._get_whisper_model(model_name)
            
            # Transcribe with OpenAI Whisper
            result = model.transcribe(
                str(audio_file),
                language=language if language != "auto" else None,
                word_timestamps=True,
                verbose=False
            )
            
            # Convert to our format
            transcript_segments = []
            
            if 'segments' in result and result['segments']:
                for segment in result['segments']:
                    # Convert log probability to confidence (0-1 scale)
                    # avg_logprob is typically negative, convert to positive confidence
                    avg_logprob = segment.get('avg_logprob', -0.5)
                    confidence = max(0.0, min(1.0, (avg_logprob + 1.0)))
                    
                    # Extract word-level timing
                    words_with_timing = []
                    if 'words' in segment and segment['words']:
                        for word_info in segment['words']:
                            words_with_timing.append({
                                'word': word_info.get('word', '').strip(),
                                'start': word_info.get('start', segment['start']),
                                'end': word_info.get('end', segment['end'])
                            })
                    
                    transcript_segments.append(TranscriptSegment(
                        text=segment['text'].strip(),
                        start_time=segment['start'],
                        end_time=segment['end'],
                        confidence=confidence,
                        words=words_with_timing if words_with_timing else None
                    ))
            else:
                # Fallback if no segments - create single segment
                if result.get('text', '').strip():
                    transcript_segments.append(TranscriptSegment(
                        text=result['text'].strip(),
                        start_time=0.0,
                        end_time=30.0,  # Estimate based on typical speech rate
                        confidence=0.7  # Default confidence
                    ))
            
            if not transcript_segments:
                raise TranscriptionError("No speech detected in audio")
            
            full_text = result.get('text', '').strip()
            if not full_text:
                full_text = " ".join(seg.text for seg in transcript_segments)
            
            detected_language = result.get('language', language)
            avg_confidence = sum(seg.confidence for seg in transcript_segments) / len(transcript_segments)
            
            return Transcript(
                segments=transcript_segments,
                language=detected_language,
                full_text=full_text,
                transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
                model_confidence=avg_confidence
            )
            
        except Exception as e:
            raise TranscriptionError(f"Whisper transcription failed: {str(e)}")
    
    def _get_faster_whisper_model(self, model_name: str = "base"):
        """Get or load faster-whisper model with caching."""
        cache_key = f"faster_whisper_{model_name}"
        
        if cache_key not in self._models:
            try:
                from faster_whisper import WhisperModel
                
                device = "cuda" if self._gpu_available else "cpu"
                compute_type = "float16" if self._gpu_available else "int8"
                
                self.logger.info("Loading faster-whisper model",
                               model=model_name,
                               device=device,
                               compute_type=compute_type)
                
                model = WhisperModel(
                    model_name,
                    device=device,
                    compute_type=compute_type,
                    download_root=str(self.settings.cache_dir / "models")
                )
                
                self._models[cache_key] = model
                
                self.logger.info("faster-whisper model loaded successfully",
                               model=model_name)
                
            except Exception as e:
                raise ModelLoadError(f"Failed to load faster-whisper model {model_name}: {str(e)}")
        
        return self._models[cache_key]
    
    def _get_whisper_model(self, model_name: str = "base"):
        """Get or load OpenAI Whisper model with caching."""
        cache_key = f"whisper_{model_name}"
        
        if cache_key not in self._models:
            try:
                import whisper
                
                self.logger.info("Loading Whisper model",
                               model=model_name,
                               download_root=str(self.settings.cache_dir / "models"))
                
                model = whisper.load_model(
                    model_name,
                    download_root=str(self.settings.cache_dir / "models")
                )
                
                # Move to GPU if available
                if self._gpu_available:
                    model = model.cuda()
                
                self._models[cache_key] = model
                
                self.logger.info("Whisper model loaded successfully",
                               model=model_name,
                               device="cuda" if self._gpu_available else "cpu")
                
            except Exception as e:
                raise ModelLoadError(f"Failed to load Whisper model {model_name}: {str(e)}")
        
        return self._models[cache_key]
    
    def restore_punctuation(self, text: str, language: str = "vi") -> str:
        """
        Restore punctuation in transcribed text using ML model or rule-based fallback.
        
        This improves:
        - TTS quality (punctuation guides pauses and intonation)
        - Scene segmentation (relies on sentence-ending punctuation)
        - Subtitle readability
        
        Args:
            text: Unpunctuated or poorly punctuated text
            language: Language code for language-specific rules
            
        Returns:
            Text with restored punctuation
        """
        if not text or not text.strip():
            return text
        
        # Try ML-based punctuation restoration first
        if self._punctuation_available:
            try:
                cache_key = "punctuation_model"
                if cache_key not in self._models:
                    from deepmultilingualpunctuation import PunctuationModel
                    self.logger.info("Loading punctuation restoration model")
                    self._models[cache_key] = PunctuationModel()
                
                model = self._models[cache_key]
                restored_text = model.restore_punctuation(text)
                
                self.logger.debug("Punctuation restored using ML model",
                                original_length=len(text),
                                restored_length=len(restored_text))
                
                return restored_text
                
            except Exception as e:
                self.logger.warning("ML punctuation restoration failed, using rule-based fallback",
                                  error=str(e))
        
        # Fallback to rule-based punctuation
        if language == "vi":
            return self._restore_punctuation_vietnamese(text)
        else:
            return self._restore_punctuation_generic(text)
    
    def _restore_punctuation_vietnamese(self, text: str) -> str:
        """Rule-based punctuation restoration for Vietnamese."""
        text = text.strip()
        
        # Common Vietnamese conjunctions that typically have commas before them
        conjunctions = ['mà', 'nhưng', 'nhưng mà', 'và', 'hay', 'hoặc', 'còn', 'thì']
        for conj in conjunctions:
            # Add comma before conjunction if not already there
            pattern = r'\s+(' + re.escape(conj) + r')\s+'
            text = re.sub(pattern, r', \1 ', text)
        
        # Common Vietnamese sentence-ending particles
        particles = ['vậy', 'rồi', 'thôi', 'nhé', 'nha', 'đó', 'đấy', 'ạ', 'à']
        for particle in particles:
            # Add period after particle if it's likely end of sentence
            pattern = r'\s+(' + re.escape(particle) + r')\s+([A-ZĐÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ])'
            text = re.sub(pattern, r' \1. \2', text)
        
        # Add periods at common break points if missing
        # Look for lowercase letter followed by uppercase (likely new sentence)
        text = re.sub(r'([a-zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ])\s+([A-ZĐÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ])', r'\1. \2', text)
        
        # Ensure first letter is capitalized
        if text:
            text = text[0].upper() + text[1:]
        
        # Add final period if missing
        if text and not text[-1] in '.!?。！？．':
            text += '.'
        
        # Clean up multiple spaces
        text = re.sub(r'\s+', ' ', text)
        
        # Clean up space before punctuation
        text = re.sub(r'\s+([,.!?;:])', r'\1', text)
        
        return text.strip()
    
    def _restore_punctuation_generic(self, text: str) -> str:
        """Generic rule-based punctuation restoration for other languages."""
        text = text.strip()
        
        # Add periods at sentence boundaries (lowercase to uppercase)
        text = re.sub(r'([a-z])\s+([A-Z])', r'\1. \2', text)
        
        # Ensure first letter is capitalized
        if text:
            text = text[0].upper() + text[1:]
        
        # Add final period if missing
        if text and not text[-1] in '.!?。！？．':
            text += '.'
        
        # Clean up multiple spaces
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _apply_punctuation_restoration(self, transcript: Transcript, language: str) -> Transcript:
        """Apply punctuation restoration to all segments in transcript."""
        restored_segments = []
        
        for segment in transcript.segments:
            restored_text = self.restore_punctuation(segment.text, language)
            
            restored_segments.append(TranscriptSegment(
                text=restored_text,
                start_time=segment.start_time,
                end_time=segment.end_time,
                confidence=segment.confidence,
                words=segment.words  # Preserve word-level timing from original segment
            ))
        
        # Update full text with restored punctuation
        full_text = " ".join(seg.text for seg in restored_segments)
        
        return Transcript(
            segments=restored_segments,
            language=transcript.language,
            full_text=full_text,
            transcription_model=transcript.transcription_model,
            model_confidence=transcript.model_confidence
        )
    
    def clear_model_cache(self):
        """Clear all cached models to free memory."""
        self.logger.info("Clearing model cache", cached_models=len(self._models))
        self._models.clear()
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about available models and system capabilities."""
        return {
            "whisper_available": self._whisper_available,
            "faster_whisper_available": self._faster_whisper_available,
            "phowhisper_available": self._phowhisper_available,
            "punctuation_available": self._punctuation_available,
            "gpu_available": self._gpu_available,
            "cached_models": list(self._models.keys()),
            "supported_languages": ["vi", "ja", "de", "en"]
        }
    
    def validate_transcript(self, transcript: Transcript) -> bool:
        """
        Validate transcript integrity and quality.
        
        Args:
            transcript: Transcript to validate
            
        Returns:
            True if transcript is valid
            
        Raises:
            TranscriptionError: If transcript is invalid
        """
        try:
            # Basic validation is handled by the dataclass __post_init__
            # Additional quality checks
            
            if transcript.model_confidence < 0.3:
                self.logger.warning("Low transcript confidence",
                                  confidence=transcript.model_confidence)
            
            # Check for reasonable segment durations
            for i, segment in enumerate(transcript.segments):
                if segment.duration > 30.0:  # Very long segment
                    self.logger.warning("Unusually long segment detected",
                                      segment_index=i,
                                      duration=segment.duration)
                
                if segment.duration < 0.1:  # Very short segment
                    self.logger.warning("Unusually short segment detected",
                                      segment_index=i,
                                      duration=segment.duration)
            
            # Check text quality
            if len(transcript.full_text.strip()) < 10:
                self.logger.warning("Very short transcript text",
                                  text_length=len(transcript.full_text))
            
            return True
            
        except Exception as e:
            raise TranscriptionError(f"Transcript validation failed: {str(e)}")
    
    def merge_segments(self, segments: List[TranscriptSegment], max_gap: float = 1.0) -> List[TranscriptSegment]:
        """
        Merge consecutive segments with small gaps.
        
        Args:
            segments: List of transcript segments
            max_gap: Maximum gap in seconds to merge across
            
        Returns:
            List of merged segments
        """
        if not segments:
            return []
        
        merged = []
        current_segment = segments[0]
        
        for next_segment in segments[1:]:
            gap = next_segment.start_time - current_segment.end_time
            
            if gap <= max_gap:
                # Merge segments
                merged_text = current_segment.text + " " + next_segment.text
                merged_confidence = (current_segment.confidence + next_segment.confidence) / 2
                
                current_segment = TranscriptSegment(
                    text=merged_text.strip(),
                    start_time=current_segment.start_time,
                    end_time=next_segment.end_time,
                    confidence=merged_confidence
                )
            else:
                # Gap too large, keep segments separate
                merged.append(current_segment)
                current_segment = next_segment
        
        # Add the last segment
        merged.append(current_segment)
        
        self.logger.debug("Merged transcript segments",
                        original_count=len(segments),
                        merged_count=len(merged),
                        max_gap=max_gap)
        
        return merged
    
    def export_transcript(self, transcript: Transcript, format: str = "srt") -> str:
        """
        Export transcript to various formats.
        
        Args:
            transcript: Transcript to export
            format: Export format ('srt', 'vtt', 'txt', 'json')
            
        Returns:
            Formatted transcript string
        """
        if format.lower() == "srt":
            return self._export_srt(transcript)
        elif format.lower() == "vtt":
            return self._export_vtt(transcript)
        elif format.lower() == "txt":
            return transcript.full_text
        elif format.lower() == "json":
            return json.dumps(transcript.to_dict(), indent=2, ensure_ascii=False)
        else:
            raise TranscriptionError(f"Unsupported export format: {format}")
    
    def _export_srt(self, transcript: Transcript) -> str:
        """Export transcript as SRT subtitle format."""
        srt_lines = []
        
        for i, segment in enumerate(transcript.segments, 1):
            # Format timestamps for SRT
            start_time = self._format_srt_timestamp(segment.start_time)
            end_time = self._format_srt_timestamp(segment.end_time)
            
            srt_lines.extend([
                str(i),
                f"{start_time} --> {end_time}",
                segment.text,
                ""  # Empty line between segments
            ])
        
        return "\n".join(srt_lines)
    
    def _export_vtt(self, transcript: Transcript) -> str:
        """Export transcript as WebVTT format."""
        vtt_lines = ["WEBVTT", ""]
        
        for segment in transcript.segments:
            # Format timestamps for VTT
            start_time = self._format_vtt_timestamp(segment.start_time)
            end_time = self._format_vtt_timestamp(segment.end_time)
            
            vtt_lines.extend([
                f"{start_time} --> {end_time}",
                segment.text,
                ""  # Empty line between segments
            ])
        
        return "\n".join(vtt_lines)
    
    def _format_srt_timestamp(self, seconds: float) -> str:
        """Format timestamp for SRT format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millisecs = int((seconds % 1) * 1000)
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisecs:03d}"
    
    def _format_vtt_timestamp(self, seconds: float) -> str:
        """Format timestamp for VTT format (HH:MM:SS.mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millisecs = int((seconds % 1) * 1000)
        
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millisecs:03d}"
