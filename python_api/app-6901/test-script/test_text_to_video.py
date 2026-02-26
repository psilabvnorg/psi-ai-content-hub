from __future__ import annotations

import json
import time
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import app.services.text_to_video as t2v_module
from app.services.text_to_video import (
    UploadedImageData,
    TextToVideoSession,
    _safe_json_load,
    _http_get_json,
    _http_post_json,
    _to_service_url,
    _validate_image_upload,
    get_studio_status,
    cleanup_text_to_video_state,
    get_audio_result,
    get_render_result,
    STUDIO_PORT,
    RETENTION_SECONDS,
)


# ---------------------------------------------------------------------------
# _to_service_url (pure function)
# ---------------------------------------------------------------------------

def test_to_service_url_absolute_unchanged():
    result = _to_service_url("http://base:9000", "http://other.com/path")
    assert result == "http://other.com/path"


def test_to_service_url_path_starting_with_slash():
    result = _to_service_url("http://base:9000", "/api/v1/data")
    assert result == "http://base:9000/api/v1/data"


def test_to_service_url_relative_path():
    result = _to_service_url("http://base:9000", "api/v1/data")
    assert result == "http://base:9000/api/v1/data"


def test_to_service_url_https_unchanged():
    result = _to_service_url("http://base:9000", "https://secure.com/path")
    assert result == "https://secure.com/path"


# ---------------------------------------------------------------------------
# _safe_json_load (pure function)
# ---------------------------------------------------------------------------

def test_safe_json_load_valid_dict():
    raw = json.dumps({"key": "value"}).encode("utf-8")
    result = _safe_json_load(raw)
    assert result["key"] == "value"


def test_safe_json_load_list_raises():
    raw = json.dumps([1, 2, 3]).encode("utf-8")
    with pytest.raises(RuntimeError, match="Expected JSON object"):
        _safe_json_load(raw)


def test_safe_json_load_nested_dict():
    raw = json.dumps({"a": {"b": 1}}).encode("utf-8")
    result = _safe_json_load(raw)
    assert result["a"]["b"] == 1


# ---------------------------------------------------------------------------
# _http_get_json
# ---------------------------------------------------------------------------

def _make_url_response(data: dict):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(data).encode("utf-8")
    mock_response.__enter__ = lambda s: s
    mock_response.__exit__ = MagicMock(return_value=False)
    return mock_response


def test_http_get_json_success():
    mock_resp = _make_url_response({"status": "ok", "data": [1, 2]})
    with patch("app.services.text_to_video.urlopen", return_value=mock_resp):
        result = _http_get_json("http://test:9000/api")
    assert result["status"] == "ok"


def test_http_get_json_non_dict_raises():
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps([1, 2, 3]).encode("utf-8")
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    with patch("app.services.text_to_video.urlopen", return_value=mock_resp):
        with pytest.raises(RuntimeError, match="Expected JSON object"):
            _http_get_json("http://test:9000/api")


# ---------------------------------------------------------------------------
# _http_post_json
# ---------------------------------------------------------------------------

def test_http_post_json_content_type_header():
    mock_resp = _make_url_response({"result": "ok"})
    captured_requests = []

    def fake_urlopen(req, timeout=None):
        captured_requests.append(req)
        return mock_resp

    with patch("app.services.text_to_video.urlopen", side_effect=fake_urlopen):
        _http_post_json("http://test:9000/api", {"key": "val"})

    assert len(captured_requests) == 1
    assert captured_requests[0].get_header("Content-type") == "application/json"


def test_http_post_json_sends_json_body():
    mock_resp = _make_url_response({"ok": True})
    captured_requests = []

    def fake_urlopen(req, timeout=None):
        captured_requests.append(req)
        return mock_resp

    with patch("app.services.text_to_video.urlopen", side_effect=fake_urlopen):
        _http_post_json("http://test:9000/api", {"name": "test", "value": 42})

    body = json.loads(captured_requests[0].data.decode("utf-8"))
    assert body["name"] == "test"
    assert body["value"] == 42


# ---------------------------------------------------------------------------
# _validate_image_upload (pure function)
# ---------------------------------------------------------------------------

def test_validate_image_upload_valid_jpg():
    upload = UploadedImageData(filename="photo.jpg", content_type="image/jpeg", data=b"fake image data")
    # Should not raise
    _validate_image_upload(upload, "thumbnail")


def test_validate_image_upload_valid_png():
    upload = UploadedImageData(filename="bg.png", content_type="image/png", data=b"data")
    _validate_image_upload(upload, "background")


def test_validate_image_upload_invalid_extension_raises():
    upload = UploadedImageData(filename="document.pdf", content_type="image/jpeg", data=b"data")
    with pytest.raises(RuntimeError, match="unsupported file extension"):
        _validate_image_upload(upload, "thumbnail")


def test_validate_image_upload_invalid_content_type_raises():
    upload = UploadedImageData(filename="photo.jpg", content_type="application/pdf", data=b"data")
    with pytest.raises(RuntimeError, match="must be an image file"):
        _validate_image_upload(upload, "thumbnail")


def test_validate_image_upload_empty_data_raises():
    upload = UploadedImageData(filename="photo.jpg", content_type="image/jpeg", data=b"")
    with pytest.raises(RuntimeError, match="is empty"):
        _validate_image_upload(upload, "thumbnail")


def test_validate_image_upload_none_content_type_ok():
    """content_type=None should not trigger the content_type check."""
    upload = UploadedImageData(filename="photo.jpg", content_type=None, data=b"data")
    # Should not raise (extension is valid)
    _validate_image_upload(upload, "thumbnail")


def test_validate_image_upload_webp_extension():
    upload = UploadedImageData(filename="img.webp", content_type="image/webp", data=b"data")
    _validate_image_upload(upload, "image")


# ---------------------------------------------------------------------------
# get_studio_status
# ---------------------------------------------------------------------------

def test_get_studio_status_not_running_when_process_none():
    with patch.object(t2v_module, "_studio_process", None):
        result = get_studio_status()
    assert result["running"] is False
    assert result["port"] == STUDIO_PORT


def test_get_studio_status_running_when_process_alive():
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None  # process still running
    with patch.object(t2v_module, "_studio_process", mock_proc):
        result = get_studio_status()
    assert result["running"] is True


def test_get_studio_status_not_running_when_process_exited():
    mock_proc = MagicMock()
    mock_proc.poll.return_value = 1  # exited with code 1
    with patch.object(t2v_module, "_studio_process", mock_proc):
        result = get_studio_status()
    assert result["running"] is False


# ---------------------------------------------------------------------------
# cleanup_text_to_video_state / get_audio_result / get_render_result
# ---------------------------------------------------------------------------

def _make_session(tmp_path) -> "TextToVideoSession":
    session_dir = tmp_path / "session"
    session_dir.mkdir()
    return TextToVideoSession(
        session_id="t2v_session_test",
        created_at=time.time(),
        root_dir=session_dir,
        audio_path=session_dir / "audio.wav",
        transcript_path=session_dir / "transcript.json",
        transcript_payload={},
        audio_file_id="file_audio",
        transcript_file_id="file_transcript",
    )


def test_cleanup_removes_expired_audio_results():
    old_time = time.time() - RETENTION_SECONDS - 100
    task_id = "t2v_audio_old_001"
    t2v_module._audio_results[task_id] = {"created_at": old_time, "data": "old"}
    try:
        cleanup_text_to_video_state()
        assert task_id not in t2v_module._audio_results
    finally:
        t2v_module._audio_results.pop(task_id, None)


def test_cleanup_keeps_fresh_audio_results():
    fresh_time = time.time()
    task_id = "t2v_audio_fresh_001"
    t2v_module._audio_results[task_id] = {"created_at": fresh_time, "data": "fresh"}
    try:
        cleanup_text_to_video_state()
        assert task_id in t2v_module._audio_results
    finally:
        t2v_module._audio_results.pop(task_id, None)


def test_cleanup_removes_expired_render_results():
    old_time = time.time() - RETENTION_SECONDS - 100
    task_id = "t2v_render_old_001"
    t2v_module._render_results[task_id] = {"created_at": old_time}
    try:
        cleanup_text_to_video_state()
        assert task_id not in t2v_module._render_results
    finally:
        t2v_module._render_results.pop(task_id, None)


def test_get_audio_result_existing():
    task_id = "t2v_audio_get_001"
    payload = {"session_id": "abc", "transcript": {}}
    t2v_module._audio_results[task_id] = payload
    try:
        result = get_audio_result(task_id)
        assert result == payload
    finally:
        t2v_module._audio_results.pop(task_id, None)


def test_get_audio_result_missing():
    result = get_audio_result("nonexistent_task_id_abc")
    assert result is None


def test_get_render_result_missing():
    result = get_render_result("nonexistent_render_id_xyz")
    assert result is None
