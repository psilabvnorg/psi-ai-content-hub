"""Integration-oriented tests for the migrated pipeline orchestration."""

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from src.multilingual_video_pipeline.models import JobStatusEnum
from src.multilingual_video_pipeline.services.pipeline import MultilingualVideoPipeline, PipelineError, ProgressCallback


class CollectingCallback(ProgressCallback):
    """Simple progress callback collector for assertions."""

    def __init__(self) -> None:
        self.started: list[str] = []
        self.completed: list[str] = []
        self.errors: list[str] = []

    def on_stage_start(self, stage_name: str, total_items: int = 1) -> None:
        self.started.append(stage_name)

    def on_stage_complete(self, stage_name: str, output_info) -> None:
        self.completed.append(stage_name)

    def on_stage_error(self, stage_name: str, error: str) -> None:
        self.errors.append(stage_name)


@pytest.fixture
def mock_settings(tmp_path: Path):
    settings = Mock()
    settings.cache_dir = tmp_path / "cache"
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    settings.use_api_services = True
    settings.api_base_url = "http://127.0.0.1:6900"
    settings.whisper_api_url = "http://127.0.0.1:6904"
    settings.vieneu_tts_api_url = "http://127.0.0.1:6903"
    settings.api_timeout = 5
    settings.youtube_rate_limit = 10
    settings.video_quality = "best"
    settings.vieneu_backbone = "gpu-full"
    settings.vieneu_codec = "neucodec-standard"
    settings.vieneu_voice_id = ""
    settings.audio_sample_rate = 48000
    return settings


def _build_pipeline(settings, callback: ProgressCallback | None = None) -> MultilingualVideoPipeline:
    with patch("src.multilingual_video_pipeline.services.pipeline.ApiClient"), patch(
        "src.multilingual_video_pipeline.services.pipeline.VideoIngestionService"
    ), patch("src.multilingual_video_pipeline.services.pipeline.TranscriptionService"), patch(
        "src.multilingual_video_pipeline.services.pipeline.VisualAssetManager"
    ), patch(
        "src.multilingual_video_pipeline.services.pipeline.ExportManager"
    ), patch(
        "src.multilingual_video_pipeline.services.pipeline.ValidationService"
    ):
        return MultilingualVideoPipeline(settings=settings, progress_callback=callback)


def test_initialize_services_uses_api_client(mock_settings) -> None:
    pipeline = _build_pipeline(mock_settings)
    assert "api_client" in pipeline._services
    assert "video_ingestion" in pipeline._services
    assert "transcription" in pipeline._services
    assert "visual_assets" in pipeline._services
    assert "export_manager" in pipeline._services
    assert "validation" in pipeline._services
    assert "scene_assembler" not in pipeline._services
    assert "subtitle_generator" not in pipeline._services


def test_process_job_new_stage_order(mock_settings) -> None:
    callback = CollectingCallback()
    pipeline = _build_pipeline(mock_settings, callback=callback)

    # Replace stage methods with deterministic stubs.
    pipeline._stage_video_ingestion = Mock(return_value={"ok": True})
    pipeline._stage_transcription = Mock(return_value={"ok": True})
    pipeline._stage_translation = Mock(return_value={"ok": True})
    pipeline._stage_visual_assets = Mock(return_value={"ok": True})
    pipeline._stage_tts_synthesis = Mock(return_value={"ok": True})
    pipeline._stage_remotion_content_prep = Mock(return_value={"ok": True})
    pipeline._stage_video_rendering = Mock(return_value={"ok": True})
    pipeline._stage_export = Mock(return_value={"ok": True})
    pipeline._stage_validation = Mock(return_value={"ok": True})

    job_id = pipeline.submit_job(
        video_url="https://www.youtube.com/watch?v=test1234567A",
        target_languages=["en"],
        output_formats=["16:9"],
    )
    result = pipeline.process_job(job_id)

    assert result["status"] == "completed"
    assert callback.errors == []
    assert callback.started == [
        "video_ingestion",
        "transcription",
        "translation",
        "visual_assets",
        "tts_synthesis",
        "remotion_content_prep",
        "video_rendering",
        "export",
        "validation",
    ]


def test_process_job_stage_failure_sets_failed(mock_settings) -> None:
    callback = CollectingCallback()
    pipeline = _build_pipeline(mock_settings, callback=callback)

    pipeline._stage_video_ingestion = Mock(return_value={"ok": True})
    pipeline._stage_transcription = Mock(side_effect=RuntimeError("boom"))
    pipeline._stage_translation = Mock(return_value={"ok": True})
    pipeline._stage_visual_assets = Mock(return_value={"ok": True})
    pipeline._stage_tts_synthesis = Mock(return_value={"ok": True})
    pipeline._stage_remotion_content_prep = Mock(return_value={"ok": True})
    pipeline._stage_video_rendering = Mock(return_value={"ok": True})
    pipeline._stage_export = Mock(return_value={"ok": True})
    pipeline._stage_validation = Mock(return_value={"ok": True})

    job_id = pipeline.submit_job(
        video_url="https://www.youtube.com/watch?v=test1234567A",
        target_languages=["en"],
        output_formats=["16:9"],
    )

    with pytest.raises(PipelineError):
        pipeline.process_job(job_id)

    job = pipeline._load_job(job_id)
    assert job.status == JobStatusEnum.FAILED
    assert "transcription" in (job.last_error or "")
