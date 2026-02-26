from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.tools_manager import (
    _which,
    _ffmpeg_bin_path,
    aget_ffmpeg_bin_path_data,
    aget_yt_dlp_bin_path_data,
    _torch_status,
    get_system_tools_status,
)

# ---------------------------------------------------------------------------
# _which
# ---------------------------------------------------------------------------

def test_which_found():
    with patch("app.services.tools_manager.shutil.which", return_value="/usr/bin/ffmpeg"):
        result = _which("ffmpeg")
    assert result == "/usr/bin/ffmpeg"


def test_which_not_found():
    with patch("app.services.tools_manager.shutil.which", return_value=None):
        result = _which("ffmpeg")
    assert result is None


# ---------------------------------------------------------------------------
# _ffmpeg_bin_path
# ---------------------------------------------------------------------------

def test_ffmpeg_bin_path_from_system_path():
    with patch("app.services.tools_manager.shutil.which", return_value="/usr/bin/ffmpeg"):
        result = _ffmpeg_bin_path()
    assert result == Path("/usr/bin/ffmpeg")


def test_ffmpeg_bin_path_not_found():
    """Returns None when not on PATH and no local ffmpeg installation."""
    with patch("app.services.tools_manager.shutil.which", return_value=None):
        with patch("app.services.tools_manager.TOOLS_ROOT") as mock_root:
            mock_candidate = MagicMock()
            mock_candidate.exists.return_value = False
            mock_root.__truediv__ = lambda self, x: mock_candidate
            result = _ffmpeg_bin_path()
    assert result is None


# ---------------------------------------------------------------------------
# aget_ffmpeg_bin_path_data
# ---------------------------------------------------------------------------

def test_aget_ffmpeg_bin_path_data_returns_path():
    with patch("app.services.tools_manager.shutil.which", return_value="/usr/bin/ffmpeg"):
        result = aget_ffmpeg_bin_path_data()
    assert result == Path("/usr/bin/ffmpeg")


def test_aget_ffmpeg_bin_path_data_returns_none_when_missing():
    with patch("app.services.tools_manager.shutil.which", return_value=None):
        with patch("app.services.tools_manager.TOOLS_ROOT") as mock_root:
            mock_candidate = MagicMock()
            mock_candidate.exists.return_value = False
            mock_root.__truediv__ = lambda self, x: mock_candidate
            result = aget_ffmpeg_bin_path_data()
    assert result is None


# ---------------------------------------------------------------------------
# aget_yt_dlp_bin_path_data
# ---------------------------------------------------------------------------

def test_aget_yt_dlp_bin_path_data_from_system():
    with patch("app.services.tools_manager.shutil.which", return_value="/usr/bin/yt-dlp"):
        result = aget_yt_dlp_bin_path_data()
    assert result == Path("/usr/bin/yt-dlp")


def test_aget_yt_dlp_bin_path_data_returns_none_when_not_found(tmp_path):
    """Returns None when yt-dlp is not on PATH and not in venv Scripts."""
    with patch("app.services.tools_manager.shutil.which", return_value=None):
        with patch("app.services.tools_manager.sys.executable", str(tmp_path / "python.exe")):
            # tmp_path/yt-dlp.exe does not exist
            result = aget_yt_dlp_bin_path_data()
    assert result is None


# ---------------------------------------------------------------------------
# _torch_status
# ---------------------------------------------------------------------------

def test_torch_status_installed():
    """torch is installed in the venv, so installed should be True."""
    result = _torch_status()
    assert result["installed"] is True
    assert isinstance(result["version"], str)
    assert len(result["version"]) > 0


def test_torch_status_not_installed():
    """When torch import fails, installed=False."""
    original = sys.modules.get("torch")
    try:
        sys.modules["torch"] = None  # type: ignore[assignment]
        result = _torch_status()
    finally:
        if original is None:
            sys.modules.pop("torch", None)
        else:
            sys.modules["torch"] = original
    assert result["installed"] is False
    assert result["version"] is None


# ---------------------------------------------------------------------------
# get_system_tools_status
# ---------------------------------------------------------------------------

def test_get_system_tools_status_structure():
    result = get_system_tools_status()
    assert "ffmpeg" in result
    assert "yt_dlp" in result
    assert "torch" in result


def test_get_system_tools_status_ffmpeg_installed_when_found():
    with patch("app.services.tools_manager.shutil.which", return_value="/usr/bin/ffmpeg"):
        result = get_system_tools_status()
    assert result["ffmpeg"]["installed"] is True
    assert result["ffmpeg"]["path"] is not None


def test_get_system_tools_status_ffmpeg_missing():
    with patch("app.services.tools_manager.shutil.which", return_value=None):
        with patch("app.services.tools_manager.TOOLS_ROOT") as mock_root:
            mock_candidate = MagicMock()
            mock_candidate.exists.return_value = False
            mock_root.__truediv__ = lambda self, x: mock_candidate
            result = get_system_tools_status()
    assert result["ffmpeg"]["installed"] is False
    assert result["ffmpeg"]["path"] is None


def test_get_system_tools_status_torch_has_required_fields():
    result = get_system_tools_status()
    torch_info = result["torch"]
    assert "installed" in torch_info
    assert "version" in torch_info
    assert "cuda" in torch_info
