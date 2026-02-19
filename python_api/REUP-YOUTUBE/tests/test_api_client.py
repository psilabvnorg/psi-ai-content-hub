"""Unit tests for shared API client helpers."""

from pathlib import Path
from unittest.mock import Mock, patch

from src.multilingual_video_pipeline.services.api_client import ApiClient, ApiClientError


class TestApiClient:
    """Test suite for ApiClient."""

    def test_extract_file_id(self) -> None:
        assert ApiClient.extract_file_id("/api/v1/files/file_123") == "file_123"
        assert ApiClient.extract_file_id("http://127.0.0.1:6900/api/v1/files/file_abc") == "file_abc"
        assert ApiClient.extract_file_id("/no/files/here") is None

    def test_stream_sse_success(self) -> None:
        settings = Mock(api_timeout=5)
        client = ApiClient(settings)

        response = Mock()
        response.raise_for_status = Mock()
        response.iter_lines.return_value = [
            'data: {"status":"processing","percent":40,"message":"working"}',
            'data: {"status":"complete","percent":100,"message":"done"}',
        ]
        client.session.request = Mock(return_value=response)

        progress_callback = Mock()
        payload = client.stream_sse(
            base_url="http://127.0.0.1:6900",
            path="/api/v1/task/stream",
            stage_name="stage",
            progress_callback=progress_callback,
        )

        assert payload["status"] == "complete"
        assert progress_callback.on_stage_progress.called

    def test_stream_sse_error(self) -> None:
        settings = Mock(api_timeout=5)
        client = ApiClient(settings)

        response = Mock()
        response.raise_for_status = Mock()
        response.iter_lines.return_value = ['data: {"status":"error","message":"boom"}']
        client.session.request = Mock(return_value=response)

        try:
            client.stream_sse(base_url="http://127.0.0.1:6900", path="/api/v1/task/stream")
            assert False, "Expected ApiClientError"
        except ApiClientError as exc:
            assert "boom" in str(exc)

    def test_poll_for_completion(self) -> None:
        settings = Mock(api_timeout=5)
        client = ApiClient(settings)

        with patch.object(client, "stream_sse", return_value={"status": "complete"}), patch.object(
            client, "get_json", return_value={"result": {"ok": True}}
        ):
            result = client.poll_for_completion(
                base_url="http://127.0.0.1:6900",
                task_id="task_1",
                stream_path="/api/v1/task/stream",
                result_path="/api/v1/task/result",
            )
            assert result["result"]["ok"] is True

    def test_download_from_url(self, tmp_path: Path) -> None:
        settings = Mock(api_timeout=5)
        client = ApiClient(settings)

        response = Mock()
        response.raise_for_status = Mock()
        response.content = b"binary-data"
        client.session.get = Mock(return_value=response)

        output_path = tmp_path / "download.bin"
        result = client.download_from_url("http://127.0.0.1:6900", "/api/v1/files/file_1", output_path)

        assert result == output_path
        assert output_path.read_bytes() == b"binary-data"

