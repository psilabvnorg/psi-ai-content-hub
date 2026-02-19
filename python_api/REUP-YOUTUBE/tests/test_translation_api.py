"""Unit tests for pipeline translation stage using Translation API."""

from pathlib import Path
from unittest.mock import Mock

import pytest

from src.multilingual_video_pipeline.models import Job, JobStatusEnum, Transcript, TranscriptSegment, TranscriptionModel
from src.multilingual_video_pipeline.services.pipeline import MultilingualVideoPipeline, PipelineError


def _make_transcript(path: Path) -> Path:
    transcript = Transcript(
        segments=[
            TranscriptSegment(text="Xin chao", start_time=0.0, end_time=1.0, confidence=0.95),
            TranscriptSegment(text="Ban khoe khong", start_time=1.0, end_time=2.2, confidence=0.94),
        ],
        language="vi",
        full_text="Xin chao Ban khoe khong",
        transcription_model=TranscriptionModel.WHISPER_MULTILINGUAL,
        model_confidence=0.94,
    )
    transcript.save_to_file(path)
    return path


def test_stage_translation_uses_api_and_writes_translated_script(tmp_path: Path) -> None:
    pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
    pipeline.progress_callback = Mock()
    pipeline.settings = Mock(api_base_url="http://127.0.0.1:6900", translation_api_url="http://127.0.0.1:6906")

    api_client = Mock()
    api_client.post_json.return_value = {"job_id": "job_translate_1"}
    api_client.poll_for_completion.return_value = {
        "status": "complete",
        "result": {
            "segments": [
                {"text": "Hello", "start": 0.0, "end": 1.0},
                {"text": "How are you", "start": 1.0, "end": 2.2},
            ]
        },
    }
    pipeline._services = {"api_client": api_client}

    transcript_path = _make_transcript(tmp_path / "transcript.json")
    job = Job(
        job_id="job_translation_stage",
        video_url="https://www.youtube.com/watch?v=test1234567A",
        target_languages=["en"],
        output_formats=["16:9"],
        status=JobStatusEnum.PROCESSING,
    )
    job.intermediate_results = {
        "transcription": {
            "transcript_path": str(transcript_path),
        }
    }

    result = pipeline._stage_translation(job, temp_dir=tmp_path, output_dir=tmp_path / "out")
    assert result["count"] == 1
    assert "en" in job.intermediate_results["translation"]

    translation_path = Path(job.intermediate_results["translation"]["en"]["translation_path"])
    assert translation_path.exists()
    payload = translation_path.read_text(encoding="utf-8")
    assert "translated_segments" in payload
    assert "How are you" in payload

    args, kwargs = api_client.post_json.call_args
    assert args[1] == "/api/v1/translation/translate"
    assert isinstance(args[2].get("segments"), list)
    assert args[2].get("source_lang") == "vi"
    assert args[2].get("target_lang") == "en"


def test_stage_translation_raises_on_missing_segments(tmp_path: Path) -> None:
    pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
    pipeline.progress_callback = Mock()
    pipeline.settings = Mock(api_base_url="http://127.0.0.1:6900", translation_api_url="http://127.0.0.1:6906")

    api_client = Mock()
    api_client.post_json.return_value = {"job_id": "job_translate_2"}
    api_client.poll_for_completion.return_value = {"status": "complete", "result": {}}
    pipeline._services = {"api_client": api_client}

    transcript_path = _make_transcript(tmp_path / "transcript.json")
    job = Job(
        job_id="job_translation_stage_fail",
        video_url="https://www.youtube.com/watch?v=test1234567A",
        target_languages=["en"],
        output_formats=["16:9"],
        status=JobStatusEnum.PROCESSING,
    )
    job.intermediate_results = {
        "transcription": {
            "transcript_path": str(transcript_path),
        }
    }

    with pytest.raises(PipelineError):
        pipeline._stage_translation(job, temp_dir=tmp_path, output_dir=tmp_path / "out")
