"""Tests for VieNeu-TTS related pipeline helpers."""

from unittest.mock import Mock

from src.multilingual_video_pipeline.services.pipeline import MultilingualVideoPipeline, PipelineError


class TestVieNeuTtsHelpers:
    """Helper-level tests for the API-based TTS migration."""

    def test_chunk_text_respects_max_chars(self) -> None:
        text = "Sentence one. Sentence two is longer. Sentence three."
        chunks = MultilingualVideoPipeline._chunk_text(text, max_chars=20)
        assert chunks
        assert all(len(chunk) <= 20 for chunk in chunks)

    def test_select_vieneu_voice_id_uses_language(self) -> None:
        pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
        pipeline.settings = Mock(vieneu_voice_id="")

        selected = pipeline._select_vieneu_voice_id(
            language="en",
            voices_payload={
                "voices": [
                    {"id": "voice_vi", "language": "vi"},
                    {"id": "voice_en", "language": "en"},
                ]
            },
        )
        assert selected == "voice_en"

    def test_select_vieneu_voice_id_raises_when_no_voices(self) -> None:
        pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
        pipeline.settings = Mock(vieneu_voice_id="")

        try:
            pipeline._select_vieneu_voice_id(language="en", voices_payload={"voices": []})
            assert False, "Expected PipelineError"
        except PipelineError:
            pass

    def test_ensure_vieneu_model_loaded_calls_sse(self) -> None:
        pipeline = MultilingualVideoPipeline.__new__(MultilingualVideoPipeline)
        pipeline.settings = Mock(
            vieneu_tts_api_url="http://127.0.0.1:6903",
            vieneu_backbone="gpu-full",
            vieneu_codec="neucodec-standard",
        )
        pipeline.progress_callback = Mock()
        api_client = Mock()

        pipeline._ensure_vieneu_model_loaded(api_client)

        api_client.stream_sse.assert_called_once()

