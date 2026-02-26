from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import app.services.stt as stt_module
from app.services.stt import (
    _strip_punctuation,
    _check_dependencies,
    _ensure_dirs,
    status,
    save_upload,
    get_result,
    result_store,
)

# ---------------------------------------------------------------------------
# _strip_punctuation (pure function)
# ---------------------------------------------------------------------------

def test_strip_punctuation_removes_punctuation():
    assert _strip_punctuation("Hello, world!") == "Hello world"


def test_strip_punctuation_preserves_unicode_letters():
    # Vietnamese characters must be preserved
    text = "Xin chào, thế giới!"
    result = _strip_punctuation(text)
    assert "Xin" in result
    assert "chào" in result
    assert "," not in result
    assert "!" not in result


def test_strip_punctuation_collapses_spaces():
    result = _strip_punctuation("hello   world")
    assert result == "hello world"


def test_strip_punctuation_empty_string_returns_empty():
    assert _strip_punctuation("") == ""


def test_strip_punctuation_only_punctuation():
    result = _strip_punctuation("!@#$%^&*()")
    assert result == ""


def test_strip_punctuation_digits_preserved():
    result = _strip_punctuation("chapter 1: intro")
    assert "1" in result
    assert ":" not in result


# ---------------------------------------------------------------------------
# _check_dependencies
# ---------------------------------------------------------------------------

def test_check_dependencies_structure():
    result = _check_dependencies()
    assert "available" in result
    assert "missing" in result
    assert "ffmpeg_ok" in result


def test_check_dependencies_ffmpeg_found():
    with patch("app.services.stt.shutil.which", return_value="/usr/bin/ffmpeg"):
        result = _check_dependencies()
    assert result["ffmpeg_ok"] is True


def test_check_dependencies_ffmpeg_missing():
    with patch("app.services.stt.shutil.which", return_value=None):
        result = _check_dependencies()
    assert result["ffmpeg_ok"] is False


def test_check_dependencies_available_and_missing_are_lists():
    result = _check_dependencies()
    assert isinstance(result["available"], list)
    assert isinstance(result["missing"], list)


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def test_status_structure(tmp_path):
    with patch("app.services.stt.MODEL_WHISPER_DIR", tmp_path):
        result = status()
    for key in ("deps_ok", "deps_missing", "ffmpeg_ok", "model_dir", "cached_models", "server_time"):
        assert key in result


def test_status_cached_models_listed(tmp_path):
    # Create fake .pt files
    (tmp_path / "base.pt").write_bytes(b"model")
    (tmp_path / "small.pt").write_bytes(b"model")
    with patch("app.services.stt.MODEL_WHISPER_DIR", tmp_path):
        result = status()
    assert "base.pt" in result["cached_models"]
    assert "small.pt" in result["cached_models"]


def test_status_model_dir_not_exist(tmp_path):
    nonexistent = tmp_path / "no_dir"
    with patch("app.services.stt.MODEL_WHISPER_DIR", nonexistent):
        result = status()
    assert result["cached_models"] == []


def test_status_model_dir_is_string(tmp_path):
    with patch("app.services.stt.MODEL_WHISPER_DIR", tmp_path):
        result = status()
    assert isinstance(result["model_dir"], str)


# ---------------------------------------------------------------------------
# save_upload
# ---------------------------------------------------------------------------

def test_save_upload_writes_bytes(tmp_path):
    content = b"audio bytes here"
    with patch("app.services.stt.TEMP_DIR", tmp_path):
        result_path = save_upload("audio.mp3", content)
    assert result_path.read_bytes() == content


def test_save_upload_correct_suffix(tmp_path):
    with patch("app.services.stt.TEMP_DIR", tmp_path):
        result_path = save_upload("recording.wav", b"data")
    assert result_path.suffix == ".wav"


def test_save_upload_default_suffix_wav(tmp_path):
    with patch("app.services.stt.TEMP_DIR", tmp_path):
        result_path = save_upload("audiofile", b"data")
    assert result_path.suffix == ".wav"


def test_save_upload_returns_path_under_temp_dir(tmp_path):
    with patch("app.services.stt.TEMP_DIR", tmp_path):
        result_path = save_upload("test.mp3", b"data")
    assert result_path.parent == tmp_path


# ---------------------------------------------------------------------------
# get_result
# ---------------------------------------------------------------------------

def test_get_result_existing():
    task_id = "stt_test_task_001"
    expected = {"text": "hello world", "segments": []}
    stt_module.result_store[task_id] = expected
    try:
        result = get_result(task_id)
        assert result == expected
    finally:
        stt_module.result_store.pop(task_id, None)


def test_get_result_missing():
    result = get_result("nonexistent_task_id_xyz")
    assert result is None


def test_get_result_returns_stored_value():
    task_id = "stt_test_task_002"
    data = {"text": "test transcription", "language": "vi"}
    stt_module.result_store[task_id] = data
    try:
        result = get_result(task_id)
        assert result["text"] == "test transcription"
        assert result["language"] == "vi"
    finally:
        stt_module.result_store.pop(task_id, None)
