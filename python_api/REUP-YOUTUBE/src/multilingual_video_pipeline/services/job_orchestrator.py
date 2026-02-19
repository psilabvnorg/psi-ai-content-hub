"""Job orchestration for coordinating the complete pipeline.

Features delivered for task 14.1:
- submit_job for job creation
- process_job to coordinate all services sequentially
- retry logic with exponential backoff
- job state persistence using JSON files
- resume from last checkpoint after crash
"""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import Job, JobStatusEnum
from ..utils.file_utils import ensure_directory


class JobOrchestratorError(Exception):
    """Raised for job orchestrator related failures."""


class JobOrchestrator(LoggerMixin):
    """Orchestrate the complete multilingual video pipeline.
    
    This class coordinates all services in the correct sequence:
    1. Video Ingestion (download, extract audio)
    2. Transcription (speech-to-text)
    3. Translation (multi-language)
    4. Visual Asset Management (image search/download)
    5. TTS (text-to-speech synthesis)
    6. Subtitle Generation (create and embed subtitles)
    7. Scene Assembly (create scenes with transitions)
    8. Video Rendering (combine all elements)
    9. Export Management (platform-specific packaging)
    
    Features:
    - Sequential service execution with checkpoint persistence
    - Automatic retry with exponential backoff
    - Resume from last checkpoint after crash
    - Comprehensive logging of all operations
    """
    
    def __init__(self, settings=None):
        """Initialize the job orchestrator.
        
        Args:
            settings: Optional settings object (uses default if not provided)
        """
        self.settings = settings or get_settings()
        self.jobs_dir = ensure_directory(self.settings.cache_dir / "jobs")
        self.logger.info("JobOrchestrator initialized", jobs_dir=str(self.jobs_dir))
    
    # ---------------------------
    # Job Management
    # ---------------------------
    
    def submit_job(
        self,
        video_url: str,
        target_languages: List[str],
        output_formats: Optional[List[str]] = None,
    ) -> str:
        """Submit a new job for processing.
        
        Args:
            video_url: YouTube video URL to process
            target_languages: List of language codes (e.g., ['en', 'vi', 'ja'])
            output_formats: List of aspect ratios (e.g., ['16:9', '9:16'])
            
        Returns:
            job_id: Unique job identifier
            
        Raises:
            JobOrchestratorError: If job creation fails
        """
        if not video_url:
            raise JobOrchestratorError("Video URL cannot be empty")
        if not target_languages:
            raise JobOrchestratorError("At least one target language required")
        
        # Default output formats
        if output_formats is None:
            output_formats = ["16:9"]  # Default to horizontal
        
        # Generate unique job ID
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        # Create job object
        job = Job(
            job_id=job_id,
            video_url=video_url,
            target_languages=target_languages,
            output_formats=output_formats,
            status=JobStatusEnum.QUEUED,
            created_at=datetime.now()
        )
        
        # Save job to disk
        self._save_job(job)
        
        self.logger.info(
            "Job submitted",
            job_id=job_id,
            video_url=video_url,
            languages=target_languages,
            formats=output_formats
        )
        
        return job_id
    
    def process_job(self, job_id: str) -> None:
        """Process a job through the complete pipeline.
        
        This method coordinates all services sequentially, saving progress
        after each service completes. If a service fails, the job state is
        persisted and can be resumed later.
        
        Args:
            job_id: Job identifier to process
            
        Raises:
            JobOrchestratorError: If job not found or processing fails
        """
        # Load job from disk
        job = self._load_job(job_id)
        
        if job.status == JobStatusEnum.COMPLETED:
            self.logger.info("Job already completed", job_id=job_id)
            return
        
        # Update status to processing
        job.status = JobStatusEnum.PROCESSING
        job.started_at = datetime.now()
        self._save_job(job)
        
        self.logger.info("Processing job started", job_id=job_id)
        
        # Define service pipeline
        # Note: These are placeholders - actual service integration will be done in task 18
        services = [
            ("video_ingestion", self._service_video_ingestion),
            ("transcription", self._service_transcription),
            ("translation", self._service_translation),
            ("visual_assets", self._service_visual_assets),
            ("tts_synthesis", self._service_tts_synthesis),
            ("scene_assembly", self._service_scene_assembly),
            ("subtitle_generation", self._service_subtitle_generation),
            ("video_rendering", self._service_video_rendering),
            ("export_packaging", self._service_export_packaging),
        ]
        
        total_services = len(services)
        
        # Find starting point (resume from last checkpoint)
        start_index = 0
        if job.current_service:
            try:
                completed_index = next(
                    i for i, (name, _) in enumerate(services)
                    if name == job.current_service
                )
                start_index = completed_index + 1
                self.logger.info(
                    "Resuming job from checkpoint",
                    job_id=job_id,
                    last_service=job.current_service,
                    resume_at=services[start_index][0] if start_index < total_services else "complete"
                )
            except StopIteration:
                self.logger.warning(
                    "Unknown service in checkpoint, starting from beginning",
                    job_id=job_id,
                    current_service=job.current_service
                )
        
        # Execute services sequentially
        try:
            for i, (service_name, service_func) in enumerate(services[start_index:], start=start_index):
                self.logger.info(
                    "Starting service",
                    job_id=job_id,
                    service=service_name,
                    progress=f"{i+1}/{total_services}"
                )
                
                try:
                    # Execute service
                    result = service_func(job)
                    
                    # Update job state
                    job.current_service = service_name
                    job.intermediate_results[service_name] = result
                    job.progress = (i + 1) / total_services
                    self._save_job(job)
                    
                    self.logger.info(
                        "Service completed",
                        job_id=job_id,
                        service=service_name,
                        progress=f"{job.progress:.1%}"
                    )
                    
                except Exception as e:
                    # Service failed - handle retry logic
                    self._handle_service_failure(job, service_name, e)
                    raise
            
            # All services completed successfully
            job.status = JobStatusEnum.COMPLETED
            job.completed_at = datetime.now()
            job.progress = 1.0
            self._save_job(job)
            
            duration = (job.completed_at - job.started_at).total_seconds()
            self.logger.info(
                "Job completed successfully",
                job_id=job_id,
                duration_seconds=duration
            )
            
        except Exception as e:
            self.logger.error(
                "Job processing failed",
                job_id=job_id,
                error=str(e),
                current_service=job.current_service,
                retry_count=job.retry_count
            )
            raise JobOrchestratorError(f"Job {job_id} failed: {e}") from e
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get current status of a job.
        
        Args:
            job_id: Job identifier
            
        Returns:
            Dictionary with job status information
        """
        job = self._load_job(job_id)
        
        return {
            "job_id": job.job_id,
            "video_url": job.video_url,
            "status": job.status.value,
            "current_service": job.current_service,
            "progress": job.progress,
            "retry_count": job.retry_count,
            "last_error": job.last_error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    
    def retry_failed_job(self, job_id: str) -> None:
        """Retry a failed job with exponential backoff.
        
        Args:
            job_id: Job identifier to retry
            
        Raises:
            JobOrchestratorError: If job cannot be retried
        """
        job = self._load_job(job_id)
        
        if not job.should_retry:
            raise JobOrchestratorError(
                f"Job {job_id} cannot be retried (status={job.status.value}, "
                f"retry_count={job.retry_count}, max_retries={job.max_retries})"
            )
        
        wait_time = job.wait_time
        self.logger.info(
            "Retrying failed job",
            job_id=job_id,
            retry_count=job.retry_count + 1,
            wait_time_seconds=wait_time
        )
        
        # Wait with exponential backoff
        time.sleep(wait_time)
        
        # Update retry count
        job.retry_count += 1
        job.status = JobStatusEnum.QUEUED
        self._save_job(job)
        
        # Process job again
        self.process_job(job_id)
    
    def list_jobs(self, status: Optional[JobStatusEnum] = None) -> List[Dict[str, Any]]:
        """List all jobs, optionally filtered by status.
        
        Args:
            status: Optional status filter
            
        Returns:
            List of job status dictionaries
        """
        jobs = []
        for job_file in self.jobs_dir.glob("*.json"):
            try:
                job = self._load_job(job_file.stem)
                if status is None or job.status == status:
                    jobs.append(self.get_job_status(job.job_id))
            except Exception as e:
                self.logger.warning(
                    "Failed to load job file",
                    file=str(job_file),
                    error=str(e)
                )
        
        # Sort by creation time (newest first)
        jobs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jobs
    
    # ---------------------------
    # Internal: Persistence
    # ---------------------------
    
    def _save_job(self, job: Job) -> None:
        """Save job to JSON file.
        
        Args:
            job: Job object to save
        """
        job_file = self.jobs_dir / f"{job.job_id}.json"
        
        try:
            with open(job_file, 'w', encoding='utf-8') as f:
                json.dump(job.to_dict(), f, indent=2, ensure_ascii=False)
            
            self.logger.debug("Job saved to disk", job_id=job.job_id, file=str(job_file))
        except Exception as e:
            raise JobOrchestratorError(f"Failed to save job {job.job_id}: {e}") from e
    
    def _load_job(self, job_id: str) -> Job:
        """Load job from JSON file.
        
        Args:
            job_id: Job identifier
            
        Returns:
            Job object
            
        Raises:
            JobOrchestratorError: If job file not found or invalid
        """
        job_file = self.jobs_dir / f"{job_id}.json"
        
        if not job_file.exists():
            raise JobOrchestratorError(f"Job {job_id} not found")
        
        try:
            with open(job_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            job = Job.from_dict(data)
            self.logger.debug("Job loaded from disk", job_id=job_id)
            return job
        except Exception as e:
            raise JobOrchestratorError(f"Failed to load job {job_id}: {e}") from e
    
    # ---------------------------
    # Internal: Error Handling
    # ---------------------------
    
    def _handle_service_failure(self, job: Job, service_name: str, error: Exception) -> None:
        """Handle service failure with retry logic.
        
        Args:
            job: Job that failed
            service_name: Name of the service that failed
            error: Exception that occurred
        """
        job.status = JobStatusEnum.FAILED
        job.last_error = f"{service_name}: {str(error)}"
        self._save_job(job)
        
        self.logger.error(
            "Service failed",
            job_id=job.job_id,
            service=service_name,
            error=str(error),
            retry_count=job.retry_count,
            can_retry=job.should_retry
        )
    
    # ---------------------------
    # Internal: Service Placeholders
    # ---------------------------
    # These are placeholder methods that will be replaced with actual service
    # integrations in task 18. For now, they simulate service execution.
    
    def _service_video_ingestion(self, job: Job) -> str:
        """Placeholder for video ingestion service.
        
        Returns:
            Path to downloaded video
        """
        self.logger.info("VIDEO INGESTION: Placeholder execution", job_id=job.job_id)
        # Simulate work
        time.sleep(0.1)
        return f"video_{job.job_id}.mp4"
    
    def _service_transcription(self, job: Job) -> str:
        """Placeholder for transcription service.
        
        Returns:
            Path to transcript file
        """
        self.logger.info("TRANSCRIPTION: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"transcript_{job.job_id}.json"
    
    def _service_translation(self, job: Job) -> str:
        """Placeholder for translation service.
        
        Returns:
            Path to translations directory
        """
        self.logger.info("TRANSLATION: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"translations_{job.job_id}/"
    
    def _service_visual_assets(self, job: Job) -> str:
        """Placeholder for visual asset management service.
        
        Returns:
            Path to visual assets directory
        """
        self.logger.info("VISUAL ASSETS: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"visual_assets_{job.job_id}/"
    
    def _service_tts_synthesis(self, job: Job) -> str:
        """Placeholder for TTS synthesis service.
        
        Returns:
            Path to synthesized audio directory
        """
        self.logger.info("TTS SYNTHESIS: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"tts_audio_{job.job_id}/"
    
    def _service_scene_assembly(self, job: Job) -> str:
        """Placeholder for scene assembly service.
        
        Returns:
            Path to assembled scenes file
        """
        self.logger.info("SCENE ASSEMBLY: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"scenes_{job.job_id}.json"
    
    def _service_subtitle_generation(self, job: Job) -> str:
        """Placeholder for subtitle generation service.
        
        Returns:
            Path to subtitles directory
        """
        self.logger.info("SUBTITLE GENERATION: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"subtitles_{job.job_id}/"
    
    def _service_video_rendering(self, job: Job) -> str:
        """Placeholder for video rendering service.
        
        Returns:
            Path to rendered videos directory
        """
        self.logger.info("VIDEO RENDERING: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"rendered_{job.job_id}/"
    
    def _service_export_packaging(self, job: Job) -> str:
        """Placeholder for export packaging service.
        
        Returns:
            Path to export packages directory
        """
        self.logger.info("EXPORT PACKAGING: Placeholder execution", job_id=job.job_id)
        time.sleep(0.1)
        return f"exports_{job.job_id}/"
