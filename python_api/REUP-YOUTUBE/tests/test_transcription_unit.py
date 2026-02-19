"""Unit tests for API-mode transcription service."""

from pathlib import Path
from unittest.mock import Mock

import pytest

from src.multilingual_video_pipeline.services.transcription import TranscriptionError, TranscriptionService


class TestTranscriptionApiMode:
    """Tests for whisper-stt API integration path."""

    def test_transcribe_audio_api_success(self, tmp_path: Path) -> None:
        audio_file = tmp_path / "audio.wav"
        audio_file.write_bytes(b"wav-data")

        settings = Mock()
        settings.cache_dir = tmp_path
        settings.use_api_services = True
        settings.whisper_api_url = "http://127.0.0.1:6904"
        settings.api_timeout = 5

        service = TranscriptionService(settings=settings, use_api=True, api_client=Mock())

        service.api_client.post_multipart.return_value = {"task_id": "stt_1"}
        service.api_client.poll_for_completion.return_value = {
            "text": "hello world",
            "text_with_punctuation": "Hello world.",
            "language": "en",
            "segments": [
                {
                    "id": 0,
                    "start": 0.0,
                    "end": 1.5,
                    "text": "Hello world.",
                    "words": [{"word": "Hello", "start": 0.0, "end": 0.6, "probability": 0.95}],
                }
            ],
        }

        transcript = service.transcribe_audio(audio_file, language="en", restore_punctuation=True)

        assert transcript.language == "en"
        assert len(transcript.segments) == 1
        assert transcript.segments[0].text == "Hello world."
        assert transcript.full_text == "Hello world."
        assert transcript.model_confidence > 0.0

    def test_transcribe_audio_api_no_segments(self, tmp_path: Path) -> None:
        audio_file = tmp_path / "audio.wav"
        audio_file.write_bytes(b"wav-data")

        settings = Mock()
        settings.cache_dir = tmp_path
        settings.use_api_services = True
        settings.whisper_api_url = "http://127.0.0.1:6904"
        settings.api_timeout = 5

        service = TranscriptionService(settings=settings, use_api=True, api_client=Mock())
        service.api_client.post_multipart.return_value = {"task_id": "stt_2"}
        service.api_client.poll_for_completion.return_value = {
            "text": "",
            "language": "en",
            "segments": [],
        }

        with pytest.raises(TranscriptionError):
            service.transcribe_audio(audio_file, language="en", restore_punctuation=False)

