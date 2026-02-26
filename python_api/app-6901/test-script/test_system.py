from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.system import (
    get_temp_stats,
    get_system_status,
    clear_temp_cache,
)


# ---------------------------------------------------------------------------
# get_temp_stats
# ---------------------------------------------------------------------------

def test_get_temp_stats_empty_dir(tmp_path):
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = get_temp_stats()
    assert result["file_count"] == 0
    assert result["total_size_mb"] == 0.0


def test_get_temp_stats_with_files(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"x" * 1024)
    (tmp_path / "b.mp3").write_bytes(b"y" * 2048)
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = get_temp_stats()
    assert result["file_count"] == 2
    expected_mb = (1024 + 2048) / (1024 * 1024)
    assert abs(result["total_size_mb"] - round(expected_mb, 2)) < 0.01


def test_get_temp_stats_ignores_subdirs(tmp_path):
    (tmp_path / "file.mp4").write_bytes(b"data")
    (tmp_path / "subdir").mkdir()
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = get_temp_stats()
    assert result["file_count"] == 1


def test_get_temp_stats_structure(tmp_path):
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = get_temp_stats()
    assert "temp_dir" in result
    assert "file_count" in result
    assert "total_size_mb" in result


def test_get_temp_stats_dir_string_in_result(tmp_path):
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = get_temp_stats()
    assert isinstance(result["temp_dir"], str)


# ---------------------------------------------------------------------------
# get_system_status
# ---------------------------------------------------------------------------

_MOCK_TOOLS = {"ffmpeg": {"installed": True}, "yt_dlp": {"installed": False}, "torch": {"installed": True}}
_MOCK_STT = {"deps_ok": True, "cached_models": []}
_MOCK_BG_REMOVE = {"model_loaded": False, "model_downloading": False}
_MOCK_TRANSLATION = {"loaded": False, "downloaded": False}


def _patch_all_services(tmp_path):
    return [
        patch("app.services.system.get_system_tools_status", return_value=_MOCK_TOOLS),
        patch("app.services.system.stt_status", return_value=_MOCK_STT),
        patch("app.services.system.bg_remove_status", return_value=_MOCK_BG_REMOVE),
        patch("app.services.system.translation_status", return_value=_MOCK_TRANSLATION),
        patch("app.services.system.TEMP_DIR", tmp_path),
    ]


def test_get_system_status_structure(tmp_path):
    patches = _patch_all_services(tmp_path)
    for p in patches:
        p.start()
    try:
        result = get_system_status()
    finally:
        for p in patches:
            p.stop()

    for key in ("status", "uptime", "base_app_dir", "temp", "tools", "models", "services"):
        assert key in result


def test_get_system_status_calls_tools(tmp_path):
    with patch("app.services.system.get_system_tools_status", return_value=_MOCK_TOOLS) as mock_tools:
        with patch("app.services.system.stt_status", return_value=_MOCK_STT):
            with patch("app.services.system.bg_remove_status", return_value=_MOCK_BG_REMOVE):
                with patch("app.services.system.translation_status", return_value=_MOCK_TRANSLATION):
                    with patch("app.services.system.TEMP_DIR", tmp_path):
                        get_system_status()
    mock_tools.assert_called_once()


def test_get_system_status_calls_stt(tmp_path):
    with patch("app.services.system.get_system_tools_status", return_value=_MOCK_TOOLS):
        with patch("app.services.system.stt_status", return_value=_MOCK_STT) as mock_stt:
            with patch("app.services.system.bg_remove_status", return_value=_MOCK_BG_REMOVE):
                with patch("app.services.system.translation_status", return_value=_MOCK_TRANSLATION):
                    with patch("app.services.system.TEMP_DIR", tmp_path):
                        get_system_status()
    mock_stt.assert_called_once()


def test_get_system_status_calls_bg_remove(tmp_path):
    with patch("app.services.system.get_system_tools_status", return_value=_MOCK_TOOLS):
        with patch("app.services.system.stt_status", return_value=_MOCK_STT):
            with patch("app.services.system.bg_remove_status", return_value=_MOCK_BG_REMOVE) as mock_bg:
                with patch("app.services.system.translation_status", return_value=_MOCK_TRANSLATION):
                    with patch("app.services.system.TEMP_DIR", tmp_path):
                        get_system_status()
    mock_bg.assert_called_once()


def test_get_system_status_calls_translation(tmp_path):
    with patch("app.services.system.get_system_tools_status", return_value=_MOCK_TOOLS):
        with patch("app.services.system.stt_status", return_value=_MOCK_STT):
            with patch("app.services.system.bg_remove_status", return_value=_MOCK_BG_REMOVE):
                with patch("app.services.system.translation_status", return_value=_MOCK_TRANSLATION) as mock_tr:
                    with patch("app.services.system.TEMP_DIR", tmp_path):
                        get_system_status()
    mock_tr.assert_called_once()


# ---------------------------------------------------------------------------
# clear_temp_cache
# ---------------------------------------------------------------------------

def test_clear_temp_cache_removes_files(tmp_path):
    (tmp_path / "a.mp4").write_bytes(b"data")
    (tmp_path / "b.mp3").write_bytes(b"data")
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = clear_temp_cache()
    assert result["removed"] == 2
    assert not (tmp_path / "a.mp4").exists()
    assert not (tmp_path / "b.mp3").exists()


def test_clear_temp_cache_skips_dirs(tmp_path):
    (tmp_path / "file.mp4").write_bytes(b"data")
    (tmp_path / "subdir").mkdir()
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = clear_temp_cache()
    assert result["removed"] == 1
    assert (tmp_path / "subdir").exists()


def test_clear_temp_cache_structure(tmp_path):
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = clear_temp_cache()
    assert result["status"] == "success"
    assert "removed" in result


def test_clear_temp_cache_empty_dir(tmp_path):
    with patch("app.services.system.TEMP_DIR", tmp_path):
        result = clear_temp_cache()
    assert result["removed"] == 0
    assert result["status"] == "success"
