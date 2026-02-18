"""
Main pipeline orchestration for multilingual video processing.

This module implements the complete end-to-end pipeline that coordinates
all 9 services in the correct sequence:
1. Video Ingestion (download, extract audio)
2. Transcription (speech-to-text)
3. Translation (multi-language)
4. Visual Asset Manager (image search/download)
5. TTS (text-to-speech synthesis)
6. Scene Assembly (create scenes with transitions)
7. Subtitle Generation (create and embed subtitles)
8. Video Rendering (combine all elements)
9. Export Manager (platform-specific packaging)

Features:
- Sequential pipeline execution with checkpoint persistence
- Progress tracking with callback support for UI/CLI integration
- Automatic intermediate file cleanup
- Comprehensive error handling and recovery
- Job status persistence and resumption
"""

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import parse_qs, urlparse

from ..config import get_settings
from ..logging_config import LoggerMixin, get_logger
from ..models import Job, JobStatusEnum, OutputFormat
from ..utils.file_utils import ensure_directory
from .video_ingestion import VideoIngestionService, VideoIngestionError
from .transcription import TranscriptionService, TranscriptionError
from .visual_asset_manager import VisualAssetManager, VisualAssetError
from .scene_assembler import SceneAssembler, SceneAssemblerError
from .subtitle_generator import SubtitleGenerator, SubtitleGeneratorError
from .export_manager import ExportManager, ExportManagerError
from .validation_service import ValidationService
from .api_client import ApiClient


logger = get_logger(__name__)


class PipelineError(Exception):
    """Raised for pipeline-related errors."""
    pass


class ProgressCallback:
    """Progress callback interface for pipeline status updates."""
    
    def on_stage_start(self, stage_name: str, total_items: int = 1) -> None:
        """Called when a pipeline stage starts."""
        pass
    
    def on_stage_progress(self, stage_name: str, current: int, total: int, status_msg: str = "") -> None:
        """Called when progress is made within a stage."""
        pass
    
    def on_stage_complete(self, stage_name: str, output_info: Dict[str, Any]) -> None:
        """Called when a pipeline stage completes."""
        pass
    
    def on_stage_error(self, stage_name: str, error: str) -> None:
        """Called when a stage encounters an error."""
        pass


class MultilingualVideoPipeline(LoggerMixin):
    """
    Main pipeline orchestration for multilingual video processing.
    
    Coordinates all services in the correct sequence and manages:
    - Service initialization and configuration
    - Sequential execution with checkpointing
    - Progress tracking and status callbacks
    - Intermediate file cleanup
    - Error handling and recovery
    """
    
    def __init__(self, settings=None, progress_callback: Optional[ProgressCallback] = None):
        """
        Initialize the multilingual video pipeline.
        
        Args:
            settings: Optional settings object (uses default if not provided)
            progress_callback: Optional callback for progress updates
        """
        self.settings = settings or get_settings()
        self.progress_callback = progress_callback or ProgressCallback()
        
        # Initialize working directories
        self.pipeline_dir = ensure_directory(self.settings.cache_dir / "pipeline")
        self.jobs_dir = ensure_directory(self.pipeline_dir / "jobs")
        self.temp_dir = ensure_directory(self.pipeline_dir / "temp")
        self.outputs_dir = ensure_directory(self.pipeline_dir / "outputs")
        
        # Initialize all services
        self._initialize_services()
        
        # Create/load job registry
        self.jobs_registry = {}  # job_id -> Job
        self._load_job_registry()
        
        self.logger.info(
            "Multilingual Video Pipeline initialized",
            pipeline_dir=str(self.pipeline_dir),
            services_ready=list(self._services.keys())
        )
    
    def _initialize_services(self) -> None:
        """Initialize all pipeline services."""
        try:
            api_client = ApiClient(self.settings)
            self._services = {
                'api_client': api_client,
                'video_ingestion': VideoIngestionService(self.settings, api_client=api_client),
                'transcription': TranscriptionService(self.settings, api_client=api_client),
                'visual_assets': VisualAssetManager(self.settings),
                'export_manager': ExportManager(self.settings),
                # ValidationService expects a cache_dir path, not the full settings object
                'validation': ValidationService(self.settings.cache_dir / "validation"),
            }
            self.logger.info("All services initialized successfully")
        except Exception as e:
            self.logger.error("Failed to initialize services", error=str(e))
            raise PipelineError(f"Service initialization failed: {e}")
    
    # ---------------------------
    # Job Management
    # ---------------------------
    
    def submit_job(
        self,
        video_url: str,
        target_languages: List[str],
        output_formats: Optional[List[str]] = None,
    ) -> str:
        """
        Submit a new video processing job.
        
        Args:
            video_url: YouTube video URL to process
            target_languages: List of language codes (e.g., ['en', 'vi', 'ja'])
            output_formats: List of aspect ratios (e.g., ['16:9', '9:16'])
            
        Returns:
            job_id: Unique job identifier
            
        Raises:
            PipelineError: If job creation fails
        """
        if not video_url:
            raise PipelineError("Video URL cannot be empty")
        if not target_languages:
            raise PipelineError("At least one target language required")
        
        # Default output formats
        if output_formats is None:
            output_formats = ["16:9"]
        
        # Generate unique job ID
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        # Create job object
        job = Job(
            job_id=job_id,
            video_url=video_url,
            target_languages=target_languages,
            output_formats=output_formats,
            status=JobStatusEnum.QUEUED,
            created_at=datetime.now(),
        )
        
        # Save job
        self._save_job(job)
        self.jobs_registry[job_id] = job
        
        self.logger.info(
            "Job submitted",
            job_id=job_id,
            video_url=video_url,
            languages=target_languages,
            formats=output_formats,
        )
        
        return job_id
    
    def process_job(self, job_id: str) -> Dict[str, Any]:
        """
        Process a job through the complete pipeline.
        
        This method coordinates all 9 services sequentially, saving progress
        after each service completes. If a service fails, the job state is
        persisted and can be resumed later.
        
        Args:
            job_id: Job identifier to process
            
        Returns:
            Processing results with output paths and metadata
            
        Raises:
            PipelineError: If job not found or processing fails
        """
        # Load job
        job = self._load_job(job_id)
        
        if job.status == JobStatusEnum.COMPLETED:
            self.logger.info("Job already completed", job_id=job_id)
            return {"status": "completed", "job_id": job_id}
        
        if job.status == JobStatusEnum.FAILED:
            raise PipelineError(f"Job {job_id} has failed. Error: {job.last_error}")
        
        # Update status to processing
        job.status = JobStatusEnum.PROCESSING
        job.started_at = datetime.now()
        self._save_job(job)
        
        # Create job working directory
        job_dir = ensure_directory(self.jobs_dir / job_id)
        temp_job_dir = ensure_directory(self.temp_dir / job_id)
        output_job_dir = ensure_directory(self.outputs_dir / job_id)
        
        self.logger.info(
            "Processing job started",
            job_id=job_id,
            video_url=job.video_url,
            languages=job.target_languages,
            job_dir=str(job_dir),
        )
        
        try:
            # Pipeline stages in correct order
            stages = [
                ("video_ingestion", self._stage_video_ingestion, job, temp_job_dir, output_job_dir),
                ("transcription", self._stage_transcription, job, temp_job_dir, output_job_dir),
                ("translation", self._stage_translation, job, temp_job_dir, output_job_dir),
                ("visual_assets", self._stage_visual_assets, job, temp_job_dir, output_job_dir),
                ("tts_synthesis", self._stage_tts_synthesis, job, temp_job_dir, output_job_dir),
                ("remotion_content_prep", self._stage_remotion_content_prep, job, temp_job_dir, output_job_dir),
                ("video_rendering", self._stage_video_rendering, job, temp_job_dir, output_job_dir),
                ("export", self._stage_export, job, output_job_dir),
                ("validation", self._stage_validation, job, output_job_dir),
            ]
            
            # Execute each stage
            for idx, stage in enumerate(stages):
                stage_name = stage[0]
                stage_func = stage[1]
                stage_args = stage[2:]
                
                # Report stage start
                self.progress_callback.on_stage_start(stage_name, 1)
                
                try:
                    # Execute stage
                    stage_result = stage_func(*stage_args)
                    
                    # Update job progress
                    progress = (idx + 1) / len(stages)
                    job.progress = progress
                    job.current_service = stage_name
                    self._save_job(job)
                    
                    # Report stage complete
                    self.progress_callback.on_stage_complete(stage_name, stage_result or {})
                    
                    self.logger.info(
                        "Stage completed",
                        job_id=job_id,
                        stage=stage_name,
                        progress_percent=int(progress * 100),
                    )
                
                except Exception as e:
                    # Report stage error
                    self.progress_callback.on_stage_error(stage_name, str(e))
                    
                    job.last_error = f"Stage '{stage_name}' failed: {str(e)}"
                    job.status = JobStatusEnum.FAILED
                    self._save_job(job)
                    
                    self.logger.error(
                        "Stage failed",
                        job_id=job_id,
                        stage=stage_name,
                        error=str(e),
                    )
                    
                    # Cleanup temporary files
                    self._cleanup_job_temps(temp_job_dir)
                    
                    raise PipelineError(job.last_error)
            
            # Mark job complete
            job.status = JobStatusEnum.COMPLETED
            job.completed_at = datetime.now()
            job.progress = 1.0
            self._save_job(job)
            
            # Cleanup temporary files
            self._cleanup_job_temps(temp_job_dir)
            
            results = {
                "job_id": job_id,
                "status": "completed",
                "output_dir": str(output_job_dir),
                "duration_seconds": (job.completed_at - job.created_at).total_seconds(),
                "languages": job.target_languages,
                "formats": job.output_formats,
            }
            
            self.logger.info(
                "Job completed successfully",
                job_id=job_id,
                duration_seconds=results["duration_seconds"],
                output_dir=str(output_job_dir),
            )
            
            return results
        
        except Exception as e:
            job.status = JobStatusEnum.FAILED
            job.last_error = str(e)
            self._save_job(job)
            
            self.logger.error(
                "Job processing failed",
                job_id=job_id,
                error=str(e),
            )
            
            raise
    
    # ---------------------------
    # Pipeline Stages
    # ---------------------------
    
    def _stage_video_ingestion(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 1: Download video and extract audio."""
        self.progress_callback.on_stage_progress("video_ingestion", 1, 1, "Downloading video...")
        
        service: VideoIngestionService = self._services['video_ingestion']
        
        try:
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "video_ingestion")

            # Download video to stage output directory
            video_id = self._extract_video_id(job.video_url)
            video_path = service.download_video(job.video_url, output_path=str(stage_output_dir / "video"))
            
            # Extract metadata (requires video id)
            metadata = None
            metadata_dict: Dict[str, Any]
            try:
                metadata = service.extract_metadata(video_id)
                metadata_path = service.save_metadata(metadata, stage_output_dir)
                metadata_dict = metadata.to_dict() if hasattr(metadata, "to_dict") else {}
            except Exception as metadata_exc:
                self.logger.warning("Metadata extraction failed, using fallback metadata", error=str(metadata_exc))
                metadata_dict = {
                    "video_id": video_id,
                    "title": f"Video {video_id}",
                    "description": "",
                    "duration": 0,
                    "channel_name": "",
                    "original_language": "auto",
                }
                metadata_path = stage_output_dir / "metadata.json"
                metadata_path.write_text(json.dumps(metadata_dict, ensure_ascii=False, indent=2), encoding="utf-8")
            
            # Extract audio to stage output directory
            audio_path = service.extract_audio(video_path, output_dir=stage_output_dir)
            
            # Store intermediate results with stage directory paths
            if metadata and hasattr(metadata, "to_dict"):
                metadata_dict = metadata.to_dict()
            
            job.intermediate_results['video_ingestion'] = {
                'video_path': str(video_path),
                'audio_path': str(audio_path),
                'metadata_path': str(metadata_path),
                'metadata': metadata_dict,
                'video_id': video_id,
                'stage_dir': str(stage_output_dir),
            }
            
            self.logger.info(
                "Video ingestion complete",
                stage_dir=str(stage_output_dir),
                video_path=str(video_path),
                audio_path=str(audio_path),
                metadata_path=str(metadata_path),
            )
            
            return job.intermediate_results['video_ingestion']
        
        except Exception as e:
            raise VideoIngestionError(f"Video ingestion failed: {e}")
    
    def _stage_transcription(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 2: Transcribe audio to text."""
        self.progress_callback.on_stage_progress("transcription", 1, 1, "Transcribing audio...")
        
        service: TranscriptionService = self._services['transcription']
        
        try:
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "transcription")
            
            audio_path = Path(job.intermediate_results['video_ingestion']['audio_path'])
            metadata = job.intermediate_results['video_ingestion']['metadata']
            source_language = metadata.get('original_language', 'auto')
            
            # Transcribe audio
            transcript = service.transcribe_audio(
                audio_path,
                language=source_language,
                restore_punctuation=True
            )
            
            # Save transcript to stage-specific output directory
            transcript_path = service.save_transcript(transcript, stage_output_dir)
            
            job.intermediate_results['transcription'] = {
                'transcript_path': str(transcript_path),
                'output_transcript_path': str(transcript_path),
                'language': transcript.language,
                'segments': len(transcript.segments),
                'duration': transcript.duration,
                'confidence': transcript.average_confidence,
                'stage_dir': str(stage_output_dir),
            }
            
            self.logger.info(
                "Transcription complete",
                stage_dir=str(stage_output_dir),
                transcript_path=str(transcript_path),
                language=transcript.language,
                segments=len(transcript.segments),
                confidence=transcript.average_confidence,
            )
            
            return job.intermediate_results['transcription']
        
        except Exception as e:
            raise TranscriptionError(f"Transcription failed: {e}")
    
    def _stage_translation(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 3: Translate transcript to target languages."""
        self.progress_callback.on_stage_progress("translation", 1, len(job.target_languages), "Translating...")

        api_client: ApiClient = self._services["api_client"]

        try:
            from ..models import Transcript, TranscriptSegment, TranslatedScript

            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "translation")

            transcript_path = Path(job.intermediate_results['transcription']['transcript_path'])
            transcript = Transcript.load_from_file(transcript_path)

            source_lang = transcript.language or "auto"
            segment_payload: List[Dict[str, Any]] = [
                {
                    "text": segment.text,
                    "start": segment.start_time,
                    "end": segment.end_time,
                }
                for segment in transcript.segments
            ]

            translations = {}
            for idx, target_lang in enumerate(job.target_languages):
                self.progress_callback.on_stage_progress(
                    "translation",
                    idx + 1,
                    len(job.target_languages),
                    f"Translating to {target_lang}..."
                )

                create_payload = api_client.post_json(
                    self.settings.api_base_url,
                    "/api/v1/translation/translate",
                    {
                        "source_lang": source_lang,
                        "target_lang": target_lang,
                        "preserve_emotion": True,
                        "segments": segment_payload,
                    },
                )
                task_id = create_payload.get("job_id")
                if not isinstance(task_id, str) or not task_id:
                    raise PipelineError("Translation API response missing job_id")

                result_envelope = api_client.poll_for_completion(
                    base_url=self.settings.api_base_url,
                    task_id=task_id,
                    stream_path="/api/v1/translation/translate/stream",
                    result_path="/api/v1/translation/translate/result",
                    stage_name="translation",
                    progress_callback=self.progress_callback,
                )
                result_payload = result_envelope.get("result")
                if not isinstance(result_payload, dict):
                    raise PipelineError(f"Translation result missing for language '{target_lang}'")

                translated_segments_payload = result_payload.get("segments")
                if not isinstance(translated_segments_payload, list) or not translated_segments_payload:
                    raise PipelineError(f"Translation segments missing for language '{target_lang}'")

                translated_segments: List[TranscriptSegment] = []
                for original_segment, translated_segment_payload in zip(transcript.segments, translated_segments_payload):
                    if not isinstance(translated_segment_payload, dict):
                        continue

                    translated_text = translated_segment_payload.get("text")
                    if not isinstance(translated_text, str) or not translated_text.strip():
                        translated_text = original_segment.text

                    raw_start = translated_segment_payload.get("start")
                    raw_end = translated_segment_payload.get("end")
                    start_time = float(raw_start) if isinstance(raw_start, (int, float)) else original_segment.start_time
                    end_time = float(raw_end) if isinstance(raw_end, (int, float)) else original_segment.end_time
                    if end_time <= start_time:
                        start_time = original_segment.start_time
                        end_time = original_segment.end_time

                    translated_segments.append(
                        TranscriptSegment(
                            text=translated_text.strip(),
                            start_time=start_time,
                            end_time=end_time,
                            confidence=max(0.0, min(1.0, original_segment.confidence * 0.95)),
                        )
                    )

                if len(translated_segments) != len(transcript.segments):
                    raise PipelineError(
                        f"Translated segment count mismatch for '{target_lang}': "
                        f"{len(translated_segments)} != {len(transcript.segments)}"
                    )

                duration_ratio = self._calculate_duration_ratio(transcript.segments, translated_segments)
                translated_script = TranslatedScript(
                    original=transcript,
                    translated_segments=translated_segments,
                    target_language=target_lang,
                    duration_ratio=duration_ratio,
                )
                quality = self._assess_translation_quality(translated_script)

                translation_path = stage_output_dir / f"translation_{target_lang}.json"
                translated_script.save_to_file(translation_path)

                if not quality["is_acceptable"]:
                    self.logger.warning(
                        "Translation quality below threshold",
                        target_language=target_lang,
                        score=quality["score"],
                        flags=quality["flags"],
                    )

                translations[target_lang] = {
                    'language': target_lang,
                    'translation_path': str(translation_path),
                    'output_translation_path': str(translation_path),
                    'segments': len(translated_script.translated_segments),
                    'duration_ratio': translated_script.duration_ratio,
                    'quality_score': quality["score"],
                    'quality_flags': quality["flags"],
                }

            job.intermediate_results['translation'] = translations
            job.intermediate_results['translation_stage_dir'] = str(stage_output_dir)

            self.logger.info(
                "Translation complete",
                stage_dir=str(stage_output_dir),
                languages=list(translations.keys()),
                count=len(translations),
            )

            return {"languages": list(translations.keys()), "count": len(translations), "stage_dir": str(stage_output_dir)}

        except Exception as e:
            raise PipelineError(f"Translation failed: {e}")
    
    def _stage_visual_assets(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 4: Search/download visuals and prepare ordered Remotion images."""
        self.progress_callback.on_stage_progress("visual_assets", 1, 1, "Finding visual assets...")
        
        service: VisualAssetManager = self._services['visual_assets']
        
        try:
            from ..models import Scene, Transcript
            
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "visual_assets")
            
            transcript_path = Path(job.intermediate_results['transcription']['transcript_path'])
            transcript = Transcript.load_from_file(transcript_path)
            
            # Create assets directory in stage output for downloaded files
            stage_assets_dir = ensure_directory(stage_output_dir / "assets")

            # End-to-end semantic search: Transcript text -> Ollama summary -> Bing search -> download
            full_text = " ".join(seg.text for seg in transcript.segments)
            limit = max(3, min(10, len(transcript.segments)))
            downloaded_assets = service.semantic_search_and_download(
                text=full_text,
                words=15,
                limit=limit,
                output_dir=stage_assets_dir,
            )
            remotion_assets = service.prepare_for_remotion(downloaded_assets, stage_output_dir)
            scene_inputs = [
                Scene(
                    scene_id=f"scene_{idx:03d}",
                    transcript_segment=segment,
                    visual_asset=None,
                    audio_segment=None,
                    duration=segment.duration,
                )
                for idx, segment in enumerate(transcript.segments)
            ]
            scene_asset_map = service.create_scene_asset_map(scene_inputs, downloaded_assets)

            asset_info = {
                'total_assets': len(downloaded_assets),
                'assets_dir': str(stage_assets_dir),
                'intro_image': remotion_assets['intro_image'],
                'content_images': remotion_assets['content_images'],
                'scene_asset_map': scene_asset_map,
                'assets': [
                    {
                        'id': asset.asset_id,
                        'type': asset.asset_type.value,
                        'path': str(asset.file_path),
                        'width': asset.width,
                        'height': asset.height,
                        'tags': asset.tags,
                    }
                    for asset in downloaded_assets
                ],
            }
            
            # Save asset info to stage output directory
            asset_info_path = service.save_asset_info(asset_info, stage_output_dir)
            
            job.intermediate_results['visual_assets'] = asset_info
            job.intermediate_results['visual_assets_stage_dir'] = str(stage_output_dir)
            job.intermediate_results['visual_assets_info_path'] = str(asset_info_path)
            
            self.logger.info(
                "Visual asset download complete",
                stage_dir=str(stage_output_dir),
                total_assets=asset_info['total_assets'],
                asset_info_path=str(asset_info_path),
            )
            
            return asset_info
        
        except Exception as e:
            raise VisualAssetError(f"Visual asset acquisition failed: {e}")
    
    def _stage_tts_synthesis(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 5: Synthesize narration audio using VieNeu-TTS API."""
        api_client: ApiClient = self._services["api_client"]

        try:
            from ..models import TranslatedScript

            stage_output_dir = ensure_directory(output_dir / "tts_synthesis")
            stage_audio_dir = ensure_directory(stage_output_dir / "audio")
            translations = job.intermediate_results["translation"]
            tts_results: Dict[str, Dict[str, Any]] = {}

            self._ensure_vieneu_model_loaded(api_client)
            voices = api_client.get_json(self.settings.vieneu_tts_api_url, "/api/v1/voices")

            for idx, (lang, trans_info) in enumerate(translations.items()):
                self.progress_callback.on_stage_progress(
                    "tts_synthesis",
                    idx + 1,
                    len(translations),
                    f"Synthesizing speech for {lang}...",
                )

                trans_path = Path(trans_info["translation_path"])
                translated = TranslatedScript.load_from_file(trans_path)
                text = translated.full_translated_text.strip()
                if not text:
                    raise PipelineError(f"No translated text available for language '{lang}'")

                voice_id = self._select_vieneu_voice_id(lang, voices)
                chunks = self._chunk_text(text, max_chars=3000)
                chunk_files: List[Path] = []

                for chunk_idx, chunk_text in enumerate(chunks, start=1):
                    create_resp = api_client.post_json(
                        self.settings.vieneu_tts_api_url,
                        "/api/v1/generate",
                        {
                            "text": chunk_text,
                            "mode": "preset",
                            "voice_id": voice_id,
                        },
                    )
                    task_id = create_resp.get("task_id")
                    if not isinstance(task_id, str) or not task_id:
                        raise PipelineError("VieNeu-TTS response missing task_id")

                    download_payload = api_client.poll_for_completion(
                        base_url=self.settings.vieneu_tts_api_url,
                        task_id=task_id,
                        stream_path="/api/v1/generate/stream",
                        result_path="/api/v1/generate/download",
                        stage_name="tts_synthesis",
                        progress_callback=self.progress_callback,
                    )
                    download_url = download_payload.get("download_url")
                    if not isinstance(download_url, str) or not download_url:
                        raise PipelineError("VieNeu-TTS download URL missing")

                    chunk_path = stage_audio_dir / f"{lang}_chunk_{chunk_idx:03d}.wav"
                    api_client.download_from_url(self.settings.vieneu_tts_api_url, download_url, chunk_path)
                    chunk_files.append(chunk_path)

                raw_audio_path = stage_audio_dir / f"{lang}_raw.wav"
                self._concat_audio_chunks(chunk_files, raw_audio_path)

                final_audio_path = stage_audio_dir / f"{lang}_narration.wav"
                self._resample_audio(raw_audio_path, final_audio_path, self.settings.audio_sample_rate)
                audio_duration = self._probe_audio_duration(final_audio_path)
                audio_size_mb = final_audio_path.stat().st_size / (1024 * 1024)

                tts_results[lang] = {
                    "audio_path": str(final_audio_path),
                    "output_audio_path": str(final_audio_path),
                    "duration": audio_duration,
                    "size_mb": audio_size_mb,
                }

                self.logger.info(
                    "TTS audio saved to stage directory",
                    lang=lang,
                    path=str(final_audio_path),
                    chunks=len(chunk_files),
                    voice_id=voice_id,
                )

            job.intermediate_results["tts_synthesis"] = tts_results
            job.intermediate_results["tts_synthesis_stage_dir"] = str(stage_output_dir)

            self.logger.info(
                "TTS synthesis complete",
                stage_dir=str(stage_output_dir),
                languages=list(tts_results.keys()),
            )
            return {"languages": list(tts_results.keys()), "count": len(tts_results), "stage_dir": str(stage_output_dir)}
        except Exception as exc:
            self.logger.error("TTS synthesis error", error=str(exc))
            raise PipelineError(f"TTS synthesis failed: {exc}")

    def _stage_remotion_content_prep(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 6: Prepare per-language Remotion content folders."""
        stage_output_dir = ensure_directory(output_dir / "remotion_content")
        transcript_path = Path(job.intermediate_results["transcription"]["transcript_path"])
        translations = job.intermediate_results["translation"]
        tts_results = job.intermediate_results["tts_synthesis"]
        assets_info = job.intermediate_results["visual_assets"]
        metadata = job.intermediate_results["video_ingestion"]["metadata"]

        intro_source = Path(assets_info["intro_image"])
        content_sources = [Path(path) for path in assets_info.get("content_images", [])]

        language_payload: Dict[str, Dict[str, Any]] = {}
        for idx, lang in enumerate(job.target_languages):
            self.progress_callback.on_stage_progress(
                "remotion_content_prep",
                idx + 1,
                len(job.target_languages),
                f"Preparing Remotion content for {lang}...",
            )

            lang_root = ensure_directory(stage_output_dir / lang)
            lang_audio_dir = ensure_directory(lang_root / "audio")
            lang_image_dir = ensure_directory(lang_root / "image")
            lang_config_dir = ensure_directory(lang_root / "config")

            narration_source = Path(tts_results[lang]["audio_path"])
            narration_target = lang_audio_dir / "narration.wav"
            shutil.copy2(narration_source, narration_target)

            transcript_caption_path = self._prepare_caption_json(
                transcript_path=transcript_path,
                translation_path=Path(translations[lang]["translation_path"]),
                output_dir=lang_audio_dir,
            )

            intro_target = lang_image_dir / "Intro.jpg"
            shutil.copy2(intro_source, intro_target)
            content_targets: List[Path] = []
            for image_idx, source_path in enumerate(content_sources[:10], start=1):
                target = lang_image_dir / f"{image_idx:02d}.jpg"
                shutil.copy2(source_path, target)
                content_targets.append(target)

            video_config_path = lang_config_dir / "video-config.json"
            video_config_path.write_text(
                json.dumps(
                    {
                        "backgroundMode": False,
                        "introDurationInFrames": 150,
                        "imageDurationInFrames": 170,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )

            intro_config_path = lang_config_dir / "intro-config.json"
            intro_config_path.write_text(
                json.dumps(
                    {
                        "templateId": "template_1",
                        "title": metadata.get("title", "Untitled"),
                        "brandName": metadata.get("channel_name") or metadata.get("uploader", ""),
                        "tagline": f"{lang} version",
                        "url": job.video_url,
                        "backgroundImage": "Intro.jpg",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )

            language_payload[lang] = {
                "content_dir": str(lang_root),
                "audio_path": str(narration_target),
                "caption_path": str(transcript_caption_path),
                "video_config_path": str(video_config_path),
                "intro_config_path": str(intro_config_path),
                "intro_image": str(intro_target),
                "content_images": [str(path) for path in content_targets],
            }

        job.intermediate_results["remotion_content"] = language_payload
        job.intermediate_results["remotion_content_stage_dir"] = str(stage_output_dir)
        return {"languages": list(language_payload.keys()), "count": len(language_payload), "stage_dir": str(stage_output_dir)}
    
    def _stage_scene_assembly(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 7: Assemble scenes with transitions."""
        service: SceneAssembler = self._services['scene_assembler']
        
        try:
            from ..models import Transcript, VisualAsset, AssetType
            from PIL import Image
            
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "scene_assembly")
            
            transcript_path = Path(job.intermediate_results['transcription']['transcript_path'])
            transcript = Transcript.load_from_file(transcript_path)
            
            # Get visual assets from earlier stage
            assets_info = job.intermediate_results['visual_assets']

            # Reconstruct VisualAsset objects from stored metadata
            visual_assets_by_id = {}  # Map: asset_id -> VisualAsset
            for asset_data in assets_info.get('assets', []):
                asset_path = Path(asset_data['path'])
                
                # Get image dimensions (prefer stored values, fallback to probe)
                width = asset_data.get('width', 1920)
                height = asset_data.get('height', 1080)
                try:
                    if asset_path.exists():
                        with Image.open(asset_path) as img:
                            width, height = img.size
                except Exception as e:
                    self.logger.warning(f"Could not read image dimensions: {e}")
                
                asset_type_str = asset_data.get('type', 'static_image')
                asset_type = AssetType.STATIC_IMAGE if 'image' in asset_type_str else AssetType.STATIC_IMAGE
                
                visual_asset = VisualAsset(
                    asset_id=asset_data['id'],
                    asset_type=asset_type,
                    file_path=asset_path,
                    source_url=None,
                    width=width,
                    height=height,
                    duration=None,
                    tags=asset_data.get('tags', []),
                )
                visual_assets_by_id[asset_data['id']] = visual_asset
            
            # Prefer explicit scene-to-asset mapping if present; otherwise cycle assets
            visual_assets_by_scene = {}
            asset_list = list(visual_assets_by_id.values())
            scene_asset_map = {item['scene_id']: item['asset_id'] for item in assets_info.get('scene_asset_map', [])}

            for idx, segment in enumerate(transcript.segments):
                scene_id = f"scene_{idx:03d}"
                mapped_asset_id = scene_asset_map.get(scene_id)
                if mapped_asset_id and mapped_asset_id in visual_assets_by_id:
                    visual_assets_by_scene[scene_id] = visual_assets_by_id[mapped_asset_id]
                elif asset_list:
                    visual_assets_by_scene[scene_id] = asset_list[idx % len(asset_list)]
            
            self.logger.info(
                "Reconstructed visual assets for scene assembly",
                total_assets=len(visual_assets_by_id),
                scenes_assigned=len(visual_assets_by_scene)
            )
            
            # Create scenes with visual assets (scene_assembler expects scene_id -> VisualAsset mapping)
            scenes = service.create_scenes(
                transcript,
                visual_assets=visual_assets_by_scene
            )
            
            self.progress_callback.on_stage_progress(
                "scene_assembly",
                1,
                1,
                f"Created {len(scenes)} scenes"
            )
            
            # Count scenes with visual content
            scenes_with_visuals = sum(1 for s in scenes if s.has_visual)
            
            scene_info = {
                'total_scenes': len(scenes),
                'scenes': len(scenes),
                'scenes_with_visuals': scenes_with_visuals,
            }
            
            job.intermediate_results['scene_assembly'] = scene_info
            job.intermediate_results['scene_assembly_stage_dir'] = str(stage_output_dir)
            
            # Save scene info to stage output directory
            import json
            scene_info_path = stage_output_dir / "scene_assembly.json"
            with open(scene_info_path, 'w', encoding='utf-8') as f:
                json.dump(scene_info, f, indent=2)
            self.logger.info("Scene assembly info saved to stage directory", path=str(scene_info_path))
            
            self.logger.info(
                "Scene assembly complete",
                stage_dir=str(stage_output_dir),
                total_scenes=len(scenes),
                scenes_with_visuals=scenes_with_visuals,
            )
            
            return scene_info
        
        except Exception as e:
            self.logger.error(f"Scene assembly error: {e}")
            raise SceneAssemblerError(f"Scene assembly failed: {e}")
    
    def _stage_subtitle_generation(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 6: Generate subtitles for all languages."""
        service: SubtitleGenerator = self._services['subtitle_generator']
        
        try:
            from ..models import TranslatedScript, Transcript, TranscriptionModel
            
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "subtitle_generation")
            
            translations = job.intermediate_results['translation']
            tts_results = job.intermediate_results['tts_synthesis']
            stage_subtitles_dir = ensure_directory(stage_output_dir / "subtitles")
            subtitle_results = {}
            
            # Generate subtitles for all languages using audio
            for idx, (lang, trans_info) in enumerate(translations.items()):
                self.progress_callback.on_stage_progress(
                    "subtitle_generation",
                    idx + 1,
                    len(translations),
                    f"Generating subtitles for {lang}..."
                )
                
                # Get the TTS audio for this language
                audio_path = tts_results[lang]['audio_path']
                
                # Load the translated text
                trans_path = Path(trans_info['translation_path'])
                translated = TranslatedScript.load_from_file(trans_path)
                
                # Generate subtitles from audio using Whisper word-level timing
                lang_subtitles = service.generate_subtitles_from_audio(
                    audio_path=str(audio_path),
                    language=lang,
                    translated_text=translated.full_translated_text
                )
                
                srt_path = stage_subtitles_dir / f"{lang}.srt"
                service.export_srt(lang_subtitles, srt_path)

                subtitle_results[lang] = {
                    'srt_path': str(srt_path),
                    'output_srt_path': str(srt_path),
                }
                self.logger.info("Subtitles saved to stage directory", path=str(srt_path), lang=lang)
            
            job.intermediate_results['subtitle_generation'] = subtitle_results
            job.intermediate_results['subtitle_generation_stage_dir'] = str(stage_output_dir)
            
            self.logger.info(
                "Subtitle generation complete",
                stage_dir=str(stage_output_dir),
                languages=list(subtitle_results.keys()),
            )
            
            return {"languages": list(subtitle_results.keys()), "count": len(subtitle_results), "stage_dir": str(stage_output_dir)}
        
        except Exception as e:
            raise SubtitleGeneratorError(f"Subtitle generation failed: {e}")
    
    def _stage_video_rendering(self, job: Job, temp_dir: Path, output_dir: Path) -> Dict[str, Any]:
        """Stage 7: Render videos through text-to-video Remotion API."""
        api_client: ApiClient = self._services["api_client"]

        try:
            stage_output_dir = ensure_directory(output_dir / "video_rendering")
            stage_render_dir = ensure_directory(stage_output_dir / "rendered")
            remotion_content = job.intermediate_results["remotion_content"]
            rendered_videos: Dict[str, Dict[str, Any]] = {}

            total_renders = len(job.target_languages) * len(job.output_formats)
            render_count = 0

            for lang in job.target_languages:
                language_content = remotion_content[lang]
                audio_path = Path(language_content["audio_path"])
                caption_path = Path(language_content["caption_path"])
                intro_image_path = Path(language_content["intro_image"])
                content_image_paths = [Path(path) for path in language_content.get("content_images", [])]
                intro_config_path = Path(language_content["intro_config_path"])
                if not content_image_paths:
                    raise PipelineError(f"No content images available for language '{lang}'")

                intro_config_text = intro_config_path.read_text(encoding="utf-8")

                with audio_path.open("rb") as audio_stream, caption_path.open("rb") as caption_stream:
                    session_payload = api_client.post_multipart(
                        self.settings.api_base_url,
                        "/api/v1/text-to-video/audio/upload",
                        files={
                            "audio_file": (audio_path.name, audio_stream, "audio/wav"),
                            "transcript_file": (caption_path.name, caption_stream, "application/json"),
                        },
                    )
                session_id = session_payload.get("session_id")
                if not isinstance(session_id, str) or not session_id:
                    raise PipelineError("Text-to-video session creation failed")

                for aspect_ratio in job.output_formats:
                    render_count += 1
                    self.progress_callback.on_stage_progress(
                        "video_rendering",
                        render_count,
                        total_renders,
                        f"Rendering {lang} {aspect_ratio}...",
                    )

                    orientation = "horizontal" if aspect_ratio == "16:9" else "vertical"

                    files_payload: List[Tuple[str, Any]] = []
                    with intro_image_path.open("rb") as intro_stream:
                        files_payload.append(("intro_image", (intro_image_path.name, intro_stream.read(), "image/jpeg")))

                    for image_path in content_image_paths[:10]:
                        with image_path.open("rb") as image_stream:
                            files_payload.append(("images", (image_path.name, image_stream.read(), "image/jpeg")))

                    render_payload = api_client.post_multipart(
                        self.settings.api_base_url,
                        "/api/v1/text-to-video/render",
                        data={
                            "session_id": session_id,
                            "orientation": orientation,
                            "intro_config_json": intro_config_text,
                        },
                        files=files_payload,
                    )
                    task_id = render_payload.get("task_id")
                    if not isinstance(task_id, str) or not task_id:
                        raise PipelineError("Render API did not return task_id")

                    render_result = api_client.poll_for_completion(
                        base_url=self.settings.api_base_url,
                        task_id=task_id,
                        stream_path="/api/v1/text-to-video/render/stream",
                        result_path="/api/v1/text-to-video/render/result",
                        stage_name="video_rendering",
                        progress_callback=self.progress_callback,
                    )

                    video_payload = render_result.get("video")
                    if not isinstance(video_payload, dict):
                        raise PipelineError("Render result is missing video payload")
                    download_url = video_payload.get("download_url")
                    if not isinstance(download_url, str) or not download_url:
                        raise PipelineError("Render result is missing download URL")

                    output_filename = f"{lang}_{aspect_ratio.replace(':', 'x')}_rendered.mp4"
                    output_video_path = stage_render_dir / output_filename
                    api_client.download_from_url(self.settings.api_base_url, download_url, output_video_path)

                    width, height = self._parse_aspect_ratio(aspect_ratio, lang)
                    key = f"{lang}_{aspect_ratio}"
                    rendered_videos[key] = {
                        "path": str(output_video_path),
                        "output_path": str(output_video_path),
                        "language": lang,
                        "aspect_ratio": aspect_ratio,
                        "resolution": (width, height),
                    }

            job.intermediate_results["video_rendering"] = rendered_videos
            job.intermediate_results["video_rendering_stage_dir"] = str(stage_output_dir)
            return {"total_videos": len(rendered_videos), "videos": list(rendered_videos.keys()), "stage_dir": str(stage_output_dir)}
        except Exception as exc:
            raise PipelineError(f"Video rendering failed: {exc}")
    
    def _stage_export(self, job: Job, output_dir: Path) -> Dict[str, Any]:
        """Stage 9: Export videos with platform-specific packaging."""
        service: ExportManager = self._services['export_manager']
        
        try:
            from ..models import OutputFormat
            from ..services.export_manager import PlatformMetadata
            
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "export")
            
            rendered_videos = job.intermediate_results['video_rendering']
            export_results = {}
            
            export_count = 0
            total_exports = len(rendered_videos)
            
            for key, video_info in rendered_videos.items():
                export_count += 1
                self.progress_callback.on_stage_progress(
                    "export",
                    export_count,
                    total_exports,
                    f"Exporting {key}..."
                )
                
                video_path = Path(video_info['path'])
                lang = video_info['language']
                aspect_ratio = video_info['aspect_ratio']
                width, height = video_info['resolution']
                
                # Create output format
                output_format = OutputFormat(
                    language=lang,
                    aspect_ratio=aspect_ratio,
                    resolution=(width, height),
                    platform="youtube"
                )
                
                # Export for YouTube
                exported_path = service.export_video(
                    video_path,
                    output_format=output_format,
                    output_dir=stage_output_dir
                )
                
                # Generate metadata
                metadata_obj = PlatformMetadata(
                    platform="youtube",
                    language=lang,
                    title=f"Video - {lang}",
                    description="Generated multilingual video",
                    tags=["multilingual", lang],
                    duration_seconds=float(video_path.stat().st_size) / 1000000,  # Placeholder
                    resolution=(width, height),
                    aspect_ratio=aspect_ratio,
                    youtube_category="Education"
                )
                
                metadata_path = service.generate_metadata(
                    metadata_obj,
                    output_dir=stage_output_dir
                )
                
                export_results[key] = {
                    'exported_path': str(exported_path),
                    'metadata_path': str(metadata_path),
                }
            
            job.intermediate_results['export'] = export_results
            job.intermediate_results['export_stage_dir'] = str(stage_output_dir)
            
            self.logger.info(
                "Export complete",
                stage_dir=str(stage_output_dir),
                total_videos=len(export_results),
            )
            
            return {"total_videos": len(export_results), "videos": list(export_results.keys()), "stage_dir": str(stage_output_dir)}
        
        except Exception as e:
            raise ExportManagerError(f"Export failed: {e}")
    
    def _stage_validation(self, job: Job, output_dir: Path) -> Dict[str, Any]:
        """Stage 10: Validate all outputs for quality and completeness."""
        service: ValidationService = self._services['validation']
        
        try:
            # Create stage-specific output directory
            stage_output_dir = ensure_directory(output_dir / "validation")
            
            validation_results = {}
            
            # Validate each rendered video
            rendered_videos = job.intermediate_results['video_rendering']
            for key, video_info in rendered_videos.items():
                self.progress_callback.on_stage_progress(
                    "validation",
                    len(validation_results) + 1,
                    len(rendered_videos),
                    f"Validating {key}..."
                )
                
                video_path = Path(video_info['path'])
                
                # Run validation
                report = service.validate_video(video_path)
                
                validation_results[key] = {
                    'valid': report.passed,
                    'issues': [
                        {
                            'severity': issue.severity.value,
                            'message': issue.message,
                        }
                        for issue in report.issues
                    ],
                }
                
                if not report.passed:
                    self.logger.warning(
                        "Validation issues found",
                        video=key,
                        issues=len(report.issues),
                    )
            
            job.intermediate_results['validation'] = validation_results
            job.intermediate_results['validation_stage_dir'] = str(stage_output_dir)
            
            # Save validation report
            import json
            validation_report_path = stage_output_dir / "validation_report.json"
            with open(validation_report_path, 'w', encoding='utf-8') as f:
                json.dump(validation_results, f, indent=2)
            self.logger.info("Validation report saved to stage directory", path=str(validation_report_path))
            
            self.logger.info(
                "Validation complete",
                stage_dir=str(stage_output_dir),
                total_validated=len(validation_results),
            )
            
            return {"total_validated": len(validation_results), "all_passed": all(
                v['valid'] for v in validation_results.values()
            ), "stage_dir": str(stage_output_dir)}
        
        except Exception as e:
            # Validation errors are non-fatal
            self.logger.warning("Validation failed (non-fatal)", error=str(e))
            return {"validation_error": str(e)}
    
    # ---------------------------
    # Helper Methods
    # ---------------------------

    @staticmethod
    def _extract_video_id(url: str) -> str:
        """Extract YouTube video id from URL or return original input."""
        parsed = urlparse(url)
        if parsed.query:
            video_id = parse_qs(parsed.query).get("v", [None])[0]
            if video_id:
                return video_id
        if "youtu.be" in parsed.netloc and parsed.path:
            return parsed.path.lstrip("/")
        return url

    @staticmethod
    def _calculate_duration_ratio(original_segments: List[Any], translated_segments: List[Any]) -> float:
        """Compute translated/original duration ratio for quality checks."""
        original_duration = sum(getattr(segment, "duration", 0.0) for segment in original_segments)
        translated_duration = sum(getattr(segment, "duration", 0.0) for segment in translated_segments)
        if original_duration <= 0:
            return 1.0
        return float(translated_duration) / float(original_duration)

    @staticmethod
    def _assess_translation_quality(translated_script: Any) -> Dict[str, Any]:
        """Assess translation quality in-process without local model inference."""
        flags: List[str] = []
        duration_ratio = float(getattr(translated_script, "duration_ratio", 1.0))

        if duration_ratio < 0.8:
            flags.append("CRITICAL: Translation too short (>20% shorter)")
        elif duration_ratio > 1.2:
            flags.append("CRITICAL: Translation too long (>20% longer)")

        translated_segments = list(getattr(translated_script, "translated_segments", []))
        original_segments = list(getattr(getattr(translated_script, "original", None), "segments", []))

        empty_segments = sum(
            1
            for segment in translated_segments
            if not isinstance(getattr(segment, "text", ""), str) or not getattr(segment, "text", "").strip()
        )
        if empty_segments > 0:
            flags.append(f"CRITICAL: {empty_segments} empty translated segments")

        if len(translated_segments) != len(original_segments):
            flags.append("CRITICAL: Segment count mismatch")

        fluency_score = 1.0 - min(abs(duration_ratio - 1.0) / 0.2, 1.0)
        accuracy_score = 0.95 if not any(flag.startswith("CRITICAL") for flag in flags) else 0.5
        avg_segment_length = (
            sum(len(getattr(segment, "text", "")) for segment in translated_segments) / max(len(translated_segments), 1)
        )
        naturalness_score = min(avg_segment_length / 100.0, 1.0)
        score = (fluency_score + accuracy_score + naturalness_score) / 3.0

        return {
            "score": score,
            "fluency": fluency_score,
            "accuracy": accuracy_score,
            "naturalness": naturalness_score,
            "duration_ratio": duration_ratio,
            "flags": flags,
            "is_acceptable": score >= 0.7
            and 0.8 <= duration_ratio <= 1.2
            and not any(flag.startswith("CRITICAL") for flag in flags),
        }

    def _ensure_vieneu_model_loaded(self, api_client: ApiClient) -> None:
        """Ensure VieNeu model is loaded before synthesis requests."""
        payload = {
            "backbone": self.settings.vieneu_backbone,
            "codec": self.settings.vieneu_codec,
        }
        api_client.stream_sse(
            base_url=self.settings.vieneu_tts_api_url,
            path="/api/v1/models/load",
            method="POST",
            json_payload=payload,
            stage_name="tts_synthesis",
            progress_callback=self.progress_callback,
        )

    def _select_vieneu_voice_id(self, language: str, voices_payload: Dict[str, Any]) -> str:
        """Resolve voice id for target language."""
        configured_voice_id = getattr(self.settings, "vieneu_voice_id", "")
        if configured_voice_id:
            return configured_voice_id

        voices = voices_payload.get("voices")
        if not isinstance(voices, list) or not voices:
            raise PipelineError("No voices returned by VieNeu-TTS API")

        for voice in voices:
            if not isinstance(voice, dict):
                continue
            voice_language = voice.get("language")
            if isinstance(voice_language, str) and voice_language.lower() == language.lower():
                voice_id = voice.get("id")
                if isinstance(voice_id, str) and voice_id:
                    return voice_id

        fallback_voice_id = voices[0].get("id") if isinstance(voices[0], dict) else None
        if not isinstance(fallback_voice_id, str) or not fallback_voice_id:
            raise PipelineError("Unable to resolve a fallback VieNeu voice_id")
        return fallback_voice_id

    @staticmethod
    def _chunk_text(text: str, max_chars: int) -> List[str]:
        """Split long text into chunks near sentence boundaries."""
        cleaned = " ".join(text.split())
        if len(cleaned) <= max_chars:
            return [cleaned]

        chunks: List[str] = []
        current = ""
        for sentence in cleaned.split(". "):
            candidate = sentence if sentence.endswith(".") else f"{sentence}."
            candidate = candidate.strip()
            if not candidate:
                continue
            if len(current) + len(candidate) + 1 <= max_chars:
                current = f"{current} {candidate}".strip()
            else:
                if current:
                    chunks.append(current)
                current = candidate
        if current:
            chunks.append(current)

        normalized_chunks: List[str] = []
        for chunk in chunks:
            if len(chunk) <= max_chars:
                normalized_chunks.append(chunk)
                continue
            start = 0
            while start < len(chunk):
                normalized_chunks.append(chunk[start : start + max_chars])
                start += max_chars
        return [chunk for chunk in normalized_chunks if chunk.strip()]

    @staticmethod
    def _concat_audio_chunks(chunk_files: List[Path], output_path: Path) -> None:
        """Concatenate wav chunk files into a single file."""
        if not chunk_files:
            raise PipelineError("No TTS chunk files available for concatenation")
        if len(chunk_files) == 1:
            shutil.copy2(chunk_files[0], output_path)
            return

        concat_manifest = output_path.with_suffix(".txt")
        concat_manifest.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in chunk_files),
            encoding="utf-8",
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_manifest),
            "-c",
            "copy",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        concat_manifest.unlink(missing_ok=True)
        if result.returncode != 0:
            raise PipelineError(f"Failed to concatenate TTS chunks: {result.stderr}")

    @staticmethod
    def _resample_audio(input_path: Path, output_path: Path, sample_rate: int) -> None:
        """Resample audio file to target sample rate."""
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-ar",
            str(sample_rate),
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise PipelineError(f"Failed to resample audio: {result.stderr}")

    @staticmethod
    def _probe_audio_duration(audio_path: Path) -> float:
        """Read audio duration using ffprobe."""
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return 0.0
        try:
            return float(result.stdout.strip()) if result.stdout.strip() else 0.0
        except ValueError:
            return 0.0

    def _prepare_caption_json(self, transcript_path: Path, translation_path: Path, output_dir: Path) -> Path:
        """Create Remotion caption JSON using translation text + transcript timings."""
        with open(transcript_path, "r", encoding="utf-8") as transcript_handle:
            transcript_payload = json.load(transcript_handle)
        with open(translation_path, "r", encoding="utf-8") as translation_handle:
            translation_payload = json.load(translation_handle)

        transcript_segments = transcript_payload.get("segments") if isinstance(transcript_payload, dict) else []
        translated_segments = translation_payload.get("translated_segments") if isinstance(translation_payload, dict) else []
        if not isinstance(transcript_segments, list):
            transcript_segments = []
        if not isinstance(translated_segments, list):
            translated_segments = []

        caption_segments: List[Dict[str, Any]] = []
        for original_segment, translated_segment in zip(transcript_segments, translated_segments):
            if not isinstance(original_segment, dict) or not isinstance(translated_segment, dict):
                continue
            start = original_segment.get("start_time", original_segment.get("start"))
            end = original_segment.get("end_time", original_segment.get("end"))
            text = translated_segment.get("text")
            if not isinstance(start, (int, float)):
                continue
            if not isinstance(end, (int, float)):
                continue
            if not isinstance(text, str):
                continue
            caption_segments.append({"text": text, "start": float(start), "end": float(end)})

        caption_payload: Dict[str, Any]
        if caption_segments:
            caption_payload = {"segments": caption_segments}
        else:
            caption_payload = transcript_payload if isinstance(transcript_payload, dict) else {"segments": []}

        caption_path = Path(output_dir) / "narration.json"
        caption_path.write_text(json.dumps(caption_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return caption_path
    
    def _parse_aspect_ratio(self, aspect_ratio: str, language: str) -> Tuple[int, int]:
        """Parse aspect ratio string to resolution tuple."""
        if aspect_ratio == "16:9":
            return (1920, 1080)  # Standard horizontal
        elif aspect_ratio == "9:16":
            if language == "vi":
                return (1080, 1920)  # Vertical for Vietnamese
            else:
                return (1080, 1920)  # Vertical default
        else:
            return (1920, 1080)  # Default fallback
    
    def _cleanup_job_temps(self, temp_dir: Path) -> None:
        """Clean up temporary files for a job."""
        try:
                # DISABLED: Keep temp files for debugging
                # if temp_dir.exists():
                #     shutil.rmtree(temp_dir)
            
                self.logger.info("Temporary files preserved for debugging", temp_dir=str(temp_dir))
        except Exception as e:
            self.logger.warning(
                "Failed to clean up temporary files",
                temp_dir=str(temp_dir),
                error=str(e),
            )
    
    def cleanup_old_jobs(self, days: int = 7) -> None:
        """
        Clean up old job files and outputs.
        
        Args:
            days: Number of days to keep (older jobs are deleted)
        """
        from datetime import timedelta
        
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            cleaned_count = 0
            
            # Clean job directories
            for job_dir in self.jobs_dir.glob("job_*"):
                if job_dir.stat().st_mtime < cutoff_date.timestamp():
                    shutil.rmtree(job_dir)
                    cleaned_count += 1
            
            # Clean output directories
            for output_dir in self.outputs_dir.glob("job_*"):
                if output_dir.stat().st_mtime < cutoff_date.timestamp():
                    shutil.rmtree(output_dir)
            
            self.logger.info(
                "Old jobs cleaned up",
                days=days,
                cleaned_count=cleaned_count,
            )
        
        except Exception as e:
            self.logger.warning("Failed to clean up old jobs", error=str(e))
    
    # ---------------------------
    # Job Persistence
    # ---------------------------
    
    def _save_job(self, job: Job) -> None:
        """Save job state to disk."""
        try:
            job_file = self.jobs_dir / f"{job.job_id}.json"
            job_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(job_file, 'w') as f:
                json.dump(job.to_dict(), f, indent=2)
        
        except Exception as e:
            self.logger.error("Failed to save job", job_id=job.job_id, error=str(e))
    
    def _load_job(self, job_id: str) -> Job:
        """Load job state from disk."""
        # Check memory cache first
        if job_id in self.jobs_registry:
            return self.jobs_registry[job_id]
        
        # Load from disk
        try:
            job_file = self.jobs_dir / f"{job_id}.json"
            
            if not job_file.exists():
                raise PipelineError(f"Job not found: {job_id}")
            
            with open(job_file, 'r') as f:
                data = json.load(f)
            
            job = Job.from_dict(data)
            self.jobs_registry[job_id] = job
            return job
        
        except Exception as e:
            raise PipelineError(f"Failed to load job {job_id}: {e}")
    
    def _load_job_registry(self) -> None:
        """Load all jobs from disk."""
        try:
            for job_file in self.jobs_dir.glob("*.json"):
                try:
                    with open(job_file, 'r') as f:
                        data = json.load(f)
                    job = Job.from_dict(data)
                    self.jobs_registry[job.job_id] = job
                except Exception as e:
                    self.logger.warning(
                        "Failed to load job file",
                        file=str(job_file),
                        error=str(e),
                    )
        
        except Exception as e:
            self.logger.warning("Failed to load job registry", error=str(e))
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get current job status."""
        try:
            job = self._load_job(job_id)
            
            return {
                "job_id": job_id,
                "status": job.status.value,
                "progress": job.progress,
                "current_stage": job.current_service,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                "error": job.last_error,
            }
        
        except Exception as e:
            raise PipelineError(f"Failed to get job status: {e}")
    
    def list_jobs(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all jobs, optionally filtered by status."""
        jobs_list = []
        
        for job in self.jobs_registry.values():
            if status and job.status.value != status:
                continue
            
            jobs_list.append({
                "job_id": job.job_id,
                "video_url": job.video_url,
                "status": job.status.value,
                "progress": job.progress,
                "created_at": job.created_at.isoformat() if job.created_at else None,
            })
        
        return sorted(jobs_list, key=lambda j: j["created_at"] or "", reverse=True)
