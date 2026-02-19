"""Tests for Remotion content preparation stage."""

import json
from pathlib import Path
from unittest.mock import Mock

from src.multilingual_video_pipeline.models import Job, JobStatusEnum
from src.multilingual_video_pipeline.services.pipeline import MultilingualVideoPipeline


def _build_job(tmp_path: Path) -> Job:
    transcript_path = tmp_path / "transcript.json"
    transcript_path.write_text(
        json.dumps(
            {
                "segments": [
                    {"text": "Hello", "start_time": 0.0, "end_time": 1.0},
                    {"text": "World", "start_time": 1.0, "end_time": 2.0},
                ]
            }
        ),
        encoding="utf-8",
    )

    translation_path = tmp_path / "translation_en.json"
    translation_path.write_text(
        json.dumps({"translated_segments": [{"text": "Hello"}, {"text": "World"}]}),
        encoding="utf-8",
    )

    narration_path = tmp_path / "en_narration.wav"
    narration_path.write_bytes(b"wav-data")

    intro_path = tmp_path / "Intro.jpg"
    intro_path.write_bytes(b"img-intro")
    image_1 = tmp_path / "01.jpg"
    image_1.write_bytes(b"img-1")
    image_2 = tmp_path / "02.jpg"
    image_2.write_bytes(b"img-2")

    job = Job(
        job_id="job_test",
        video_url="https://www.youtube.com/watch?v=test1234567A",
        target_languages=["en"],
        output_formats=["16:9"],
        status=JobStatusEnum.PROCESSING,
    )
    job.intermediate_results = {
        "transcription": {"transcript_path": str(transcript_path)},
        "translation": {"en": {"translation_path": str(translation_path)}},
        "tts_synthesis": {"en": {"audio_path": str(narration_path)}},
        "visual_assets": {
            "intro_image": str(intro_path),
            "content_images": [str(image_1), str(image_2)],
        },
        "video_ingestion": {"metadata": {"title": "Demo", "channel_name": "Channel"}},
    }
    return job


def test_stage_remotion_content_prep(tmp_path: Path) -> None:
    pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
    pipeline.progress_callback = Mock()

    job = _build_job(tmp_path)
    result = pipeline._stage_remotion_content_prep(job, temp_dir=tmp_path, output_dir=tmp_path / "out")

    assert result["count"] == 1
    assert "remotion_content" in job.intermediate_results

    language_payload = job.intermediate_results["remotion_content"]["en"]
    assert Path(language_payload["audio_path"]).exists()
    assert Path(language_payload["caption_path"]).exists()
    assert Path(language_payload["video_config_path"]).exists()
    assert Path(language_payload["intro_config_path"]).exists()
    assert len(language_payload["content_images"]) == 2

