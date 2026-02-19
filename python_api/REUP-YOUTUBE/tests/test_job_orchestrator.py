"""Tests for JobOrchestrator service."""

import json
import pytest
import tempfile
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from src.multilingual_video_pipeline.models import Job, JobStatusEnum
from src.multilingual_video_pipeline.services import JobOrchestrator, JobOrchestratorError


class TestJobOrchestrator:
    """Test JobOrchestrator initialization and configuration."""
    
    def test_init(self):
        """Test orchestrator initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            assert orchestrator.settings == settings
            assert orchestrator.jobs_dir.exists()
            assert orchestrator.jobs_dir == Path(tmpdir) / "jobs"
    
    def test_init_creates_jobs_directory(self):
        """Test that jobs directory is created if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            assert (Path(tmpdir) / "jobs").exists()


class TestSubmitJob:
    """Test job submission."""
    
    def test_submit_job_success(self):
        """Test successful job submission."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en", "vi"]
            )
            
            assert job_id.startswith("job_")
            assert (Path(tmpdir) / "jobs" / f"{job_id}.json").exists()
    
    def test_submit_job_with_output_formats(self):
        """Test job submission with custom output formats."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en", "vi", "ja"],
                output_formats=["16:9", "9:16"]
            )
            
            # Load job and verify
            job = orchestrator._load_job(job_id)
            assert job.output_formats == ["16:9", "9:16"]
            assert job.target_languages == ["en", "vi", "ja"]
    
    def test_submit_job_default_format(self):
        """Test that default output format is 16:9."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            job = orchestrator._load_job(job_id)
            assert job.output_formats == ["16:9"]
    
    def test_submit_job_empty_url(self):
        """Test that empty URL raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            with pytest.raises(JobOrchestratorError, match="Video URL cannot be empty"):
                orchestrator.submit_job(
                    video_url="",
                    target_languages=["en"]
                )
    
    def test_submit_job_empty_languages(self):
        """Test that empty languages list raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            with pytest.raises(JobOrchestratorError, match="At least one target language required"):
                orchestrator.submit_job(
                    video_url="https://youtube.com/watch?v=test123",
                    target_languages=[]
                )
    
    def test_submit_job_initial_status(self):
        """Test that submitted job has QUEUED status."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            job = orchestrator._load_job(job_id)
            assert job.status == JobStatusEnum.QUEUED
            assert job.progress == 0.0
            assert job.retry_count == 0


class TestProcessJob:
    """Test job processing."""
    
    def test_process_job_success(self):
        """Test successful job processing through all services."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            orchestrator.process_job(job_id)
            
            job = orchestrator._load_job(job_id)
            assert job.status == JobStatusEnum.COMPLETED
            assert job.progress == 1.0
            assert job.completed_at is not None
            assert len(job.intermediate_results) == 9  # All 9 services
    
    def test_process_job_updates_progress(self):
        """Test that progress is updated after each service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            orchestrator.process_job(job_id)
            
            job = orchestrator._load_job(job_id)
            # Progress should be 1.0 after all services
            assert job.progress == 1.0
    
    def test_process_job_already_completed(self):
        """Test that processing completed job is idempotent."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Process once
            orchestrator.process_job(job_id)
            first_completed = orchestrator._load_job(job_id).completed_at
            
            # Process again
            orchestrator.process_job(job_id)
            second_completed = orchestrator._load_job(job_id).completed_at
            
            # Should not reprocess
            assert first_completed == second_completed
    
    def test_process_job_service_failure(self):
        """Test handling of service failure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Mock a service to fail
            original_func = orchestrator._service_transcription
            def failing_service(job):
                raise ValueError("Simulated transcription failure")
            orchestrator._service_transcription = failing_service
            
            try:
                with pytest.raises(JobOrchestratorError):
                    orchestrator.process_job(job_id)
                
                job = orchestrator._load_job(job_id)
                assert job.status == JobStatusEnum.FAILED
                assert "transcription" in job.last_error
                assert job.current_service == "video_ingestion"  # Last successful
            finally:
                orchestrator._service_transcription = original_func
    
    def test_process_job_nonexistent(self):
        """Test processing non-existent job raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            with pytest.raises(JobOrchestratorError, match="Job nonexistent not found"):
                orchestrator.process_job("nonexistent")


class TestJobResume:
    """Test job resume from checkpoint."""
    
    def test_resume_from_checkpoint(self):
        """Test that job resumes from last completed service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Simulate partial processing
            job = orchestrator._load_job(job_id)
            job.status = JobStatusEnum.PROCESSING
            job.current_service = "transcription"
            job.intermediate_results = {
                "video_ingestion": "video.mp4",
                "transcription": "transcript.json"
            }
            job.progress = 0.22  # 2 out of 9 services
            orchestrator._save_job(job)
            
            # Resume processing
            orchestrator.process_job(job_id)
            
            job = orchestrator._load_job(job_id)
            assert job.status == JobStatusEnum.COMPLETED
            assert job.progress == 1.0
            assert len(job.intermediate_results) == 9


class TestRetryLogic:
    """Test retry logic with exponential backoff."""
    
    def test_retry_failed_job(self):
        """Test retrying a failed job."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Simulate failure
            job = orchestrator._load_job(job_id)
            job.status = JobStatusEnum.FAILED
            job.retry_count = 1
            orchestrator._save_job(job)
            
            # Mock time.sleep to avoid actual waiting
            with patch('time.sleep'):
                orchestrator.retry_failed_job(job_id)
            
            job = orchestrator._load_job(job_id)
            assert job.status == JobStatusEnum.COMPLETED
            assert job.retry_count == 2
    
    def test_retry_max_retries_exceeded(self):
        """Test that job cannot be retried after max retries."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Simulate max retries exceeded
            job = orchestrator._load_job(job_id)
            job.status = JobStatusEnum.FAILED
            job.retry_count = 5
            job.max_retries = 5
            orchestrator._save_job(job)
            
            with pytest.raises(JobOrchestratorError, match="cannot be retried"):
                orchestrator.retry_failed_job(job_id)
    
    def test_exponential_backoff(self):
        """Test exponential backoff calculation."""
        job = Job(
            job_id="test",
            video_url="http://test.com",
            target_languages=["en"],
            output_formats=["16:9"],
            status=JobStatusEnum.FAILED
        )
        
        # Test backoff times
        job.retry_count = 0
        assert job.wait_time == 1  # 2^0 = 1
        
        job.retry_count = 1
        assert job.wait_time == 2  # 2^1 = 2
        
        job.retry_count = 2
        assert job.wait_time == 4  # 2^2 = 4
        
        job.retry_count = 3
        assert job.wait_time == 8  # 2^3 = 8
        
        job.retry_count = 10
        assert job.wait_time == 300  # Capped at 5 minutes


class TestJobStatus:
    """Test job status retrieval."""
    
    def test_get_job_status(self):
        """Test getting job status."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en", "vi"]
            )
            
            status = orchestrator.get_job_status(job_id)
            
            assert status["job_id"] == job_id
            assert status["video_url"] == "https://youtube.com/watch?v=test123"
            assert status["status"] == "queued"
            assert status["progress"] == 0.0
            assert status["retry_count"] == 0
    
    def test_list_jobs(self):
        """Test listing all jobs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            # Create multiple jobs
            job1 = orchestrator.submit_job("https://youtube.com/1", ["en"])
            job2 = orchestrator.submit_job("https://youtube.com/2", ["vi"])
            job3 = orchestrator.submit_job("https://youtube.com/3", ["ja"])
            
            jobs = orchestrator.list_jobs()
            
            assert len(jobs) == 3
            job_ids = [j["job_id"] for j in jobs]
            assert job1 in job_ids
            assert job2 in job_ids
            assert job3 in job_ids
    
    def test_list_jobs_filtered(self):
        """Test listing jobs filtered by status."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            # Create jobs with different statuses
            job1 = orchestrator.submit_job("https://youtube.com/1", ["en"])
            job2 = orchestrator.submit_job("https://youtube.com/2", ["vi"])
            
            # Process one job
            orchestrator.process_job(job1)
            
            # List only completed jobs
            completed = orchestrator.list_jobs(status=JobStatusEnum.COMPLETED)
            assert len(completed) == 1
            assert completed[0]["job_id"] == job1
            
            # List only queued jobs
            queued = orchestrator.list_jobs(status=JobStatusEnum.QUEUED)
            assert len(queued) == 1
            assert queued[0]["job_id"] == job2


class TestPersistence:
    """Test JSON persistence."""
    
    def test_job_persisted_after_submission(self):
        """Test that job is saved to disk after submission."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Verify file exists
            job_file = Path(tmpdir) / "jobs" / f"{job_id}.json"
            assert job_file.exists()
            
            # Verify content
            with open(job_file) as f:
                data = json.load(f)
            assert data["job_id"] == job_id
            assert data["video_url"] == "https://youtube.com/watch?v=test123"
    
    def test_job_persisted_during_processing(self):
        """Test that job is saved after each service."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            orchestrator = JobOrchestrator(settings=settings)
            
            job_id = orchestrator.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            orchestrator.process_job(job_id)
            
            # Load from disk (not using _load_job to verify actual file)
            job_file = Path(tmpdir) / "jobs" / f"{job_id}.json"
            with open(job_file) as f:
                data = json.load(f)
            
            assert data["status"] == "completed"
            assert data["progress"] == 1.0
            assert len(data["intermediate_results"]) == 9
    
    def test_recovery_after_crash(self):
        """Test that jobs can be recovered after simulated crash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = Mock(cache_dir=Path(tmpdir))
            
            # Create orchestrator and submit job
            orchestrator1 = JobOrchestrator(settings=settings)
            job_id = orchestrator1.submit_job(
                video_url="https://youtube.com/watch?v=test123",
                target_languages=["en"]
            )
            
            # Simulate partial processing
            job = orchestrator1._load_job(job_id)
            job.status = JobStatusEnum.PROCESSING
            job.current_service = "translation"
            job.intermediate_results = {
                "video_ingestion": "video.mp4",
                "transcription": "transcript.json",
                "translation": "translations/"
            }
            orchestrator1._save_job(job)
            
            # Simulate crash by creating new orchestrator instance
            orchestrator2 = JobOrchestrator(settings=settings)
            
            # Resume processing
            orchestrator2.process_job(job_id)
            
            # Verify completion
            job = orchestrator2._load_job(job_id)
            assert job.status == JobStatusEnum.COMPLETED
            assert job.progress == 1.0


class TestJobModel:
    """Test Job dataclass behavior."""
    
    def test_job_should_retry(self):
        """Test should_retry property."""
        job = Job(
            job_id="test",
            video_url="http://test.com",
            target_languages=["en"],
            output_formats=["16:9"],
            status=JobStatusEnum.FAILED,
            retry_count=3,
            max_retries=5
        )
        
        assert job.should_retry is True
        
        job.retry_count = 5
        assert job.should_retry is False
        
        job.retry_count = 2
        job.status = JobStatusEnum.COMPLETED
        assert job.should_retry is False
    
    def test_job_serialization(self):
        """Test job to_dict and from_dict."""
        job = Job(
            job_id="test123",
            video_url="http://test.com",
            target_languages=["en", "vi"],
            output_formats=["16:9", "9:16"],
            status=JobStatusEnum.PROCESSING,
            current_service="transcription",
            progress=0.5,
            retry_count=2
        )
        
        # Serialize
        data = job.to_dict()
        assert data["job_id"] == "test123"
        assert data["status"] == "processing"
        assert data["progress"] == 0.5
        
        # Deserialize
        job2 = Job.from_dict(data)
        assert job2.job_id == job.job_id
        assert job2.status == job.status
        assert job2.progress == job.progress
        assert job2.target_languages == job.target_languages
