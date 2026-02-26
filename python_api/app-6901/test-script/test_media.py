from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

from app.services.media import (
    UPSCAYL_MODELS,
    _UPSCAYL_BIN,
    get_ffmpeg_cmd,
    get_upscayl_models,
    is_upscayl_binary_found,
    save_upload,
    trim_video,
    extract_audio,
    convert_audio,
    trim_audio,
    adjust_video_speed,
    upscale_image,
)

# ---------------------------------------------------------------------------
# get_ffmpeg_cmd
# ---------------------------------------------------------------------------

def test_get_ffmpeg_cmd_with_binary_path():
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=Path("/usr/bin/ffmpeg")):
        result = get_ffmpeg_cmd()
    assert result == str(Path("/usr/bin/ffmpeg"))


def test_get_ffmpeg_cmd_fallback_to_bare_name():
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        result = get_ffmpeg_cmd()
    assert result == "ffmpeg"


# ---------------------------------------------------------------------------
# save_upload
# ---------------------------------------------------------------------------

def test_save_upload_writes_correct_bytes(tmp_path):
    data = b"video content bytes"
    with patch("app.services.media.TEMP_DIR", tmp_path):
        result_path = save_upload("video.mp4", data)
    assert result_path.read_bytes() == data


def test_save_upload_returns_path_with_correct_suffix(tmp_path):
    with patch("app.services.media.TEMP_DIR", tmp_path):
        result_path = save_upload("audio.wav", b"data")
    assert result_path.suffix == ".wav"


def test_save_upload_empty_filename_raises(tmp_path):
    with patch("app.services.media.TEMP_DIR", tmp_path):
        with pytest.raises(ValueError, match="filename is required"):
            save_upload("", b"data")


def test_save_upload_no_extension_uses_bin(tmp_path):
    with patch("app.services.media.TEMP_DIR", tmp_path):
        result_path = save_upload("myfile", b"data")
    assert result_path.suffix == ".bin"


# ---------------------------------------------------------------------------
# trim_video
# ---------------------------------------------------------------------------

def test_trim_video_without_end_time(tmp_path):
    input_file = tmp_path / "input.mp4"
    input_file.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            result = trim_video(input_file, "00:00:10")
    args = mock_cc.call_args[0][0]
    assert "-ss" in args
    assert "00:00:10" in args
    assert "-to" not in args


def test_trim_video_with_end_time(tmp_path):
    input_file = tmp_path / "input.mp4"
    input_file.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            result = trim_video(input_file, "00:00:10", "00:01:00")
    args = mock_cc.call_args[0][0]
    assert "-to" in args
    assert "00:01:00" in args


def test_trim_video_returns_trimmed_path(tmp_path):
    input_file = tmp_path / "input.mp4"
    input_file.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call"):
            result = trim_video(input_file, "00:00:05")
    assert result.name == "input.trimmed.mp4"


# ---------------------------------------------------------------------------
# extract_audio
# ---------------------------------------------------------------------------

def test_extract_audio_invalid_format_raises(tmp_path):
    f = tmp_path / "video.mp4"
    with pytest.raises(ValueError, match="format must be mp3 or wav"):
        extract_audio(f, "ogg")


def test_extract_audio_mp3_uses_libmp3lame(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            extract_audio(f, "mp3")
    args = mock_cc.call_args[0][0]
    assert "libmp3lame" in args


def test_extract_audio_wav_uses_pcm_s16le(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            extract_audio(f, "wav")
    args = mock_cc.call_args[0][0]
    assert "pcm_s16le" in args


def test_extract_audio_returns_correct_extension(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call"):
            result = extract_audio(f, "mp3")
    assert result.suffix == ".mp3"


# ---------------------------------------------------------------------------
# convert_audio
# ---------------------------------------------------------------------------

def test_convert_audio_invalid_format_raises(tmp_path):
    f = tmp_path / "audio.mp3"
    with pytest.raises(ValueError, match="output_format must be mp3 or wav"):
        convert_audio(f, "flac")


def test_convert_audio_calls_ffmpeg(tmp_path):
    f = tmp_path / "audio.mp3"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            convert_audio(f, "wav")
    mock_cc.assert_called_once()


# ---------------------------------------------------------------------------
# trim_audio
# ---------------------------------------------------------------------------

def test_trim_audio_invalid_format_raises(tmp_path):
    f = tmp_path / "audio.mp3"
    with pytest.raises(ValueError, match="output_format must be mp3 or wav"):
        trim_audio(f, "00:00:05", output_format="flac")


def test_trim_audio_with_end_time(tmp_path):
    f = tmp_path / "audio.mp3"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            trim_audio(f, "00:00:05", "00:00:30")
    args = mock_cc.call_args[0][0]
    assert "-to" in args
    assert "00:00:30" in args


def test_trim_audio_without_end_time(tmp_path):
    f = tmp_path / "audio.mp3"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            trim_audio(f, "00:00:05")
    args = mock_cc.call_args[0][0]
    assert "-to" not in args


# ---------------------------------------------------------------------------
# adjust_video_speed
# ---------------------------------------------------------------------------

def test_adjust_video_speed_too_slow_raises(tmp_path):
    f = tmp_path / "video.mp4"
    with pytest.raises(ValueError, match="speed must be between"):
        adjust_video_speed(f, 0.4)


def test_adjust_video_speed_too_fast_raises(tmp_path):
    f = tmp_path / "video.mp4"
    with pytest.raises(ValueError, match="speed must be between"):
        adjust_video_speed(f, 2.1)


def test_adjust_video_speed_pts_formula(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call") as mock_cc:
            adjust_video_speed(f, 2.0)
    args = mock_cc.call_args[0][0]
    # pts_multiplier = 1.0 / 2.0 = 0.5
    assert any("setpts=0.5*PTS" in str(a) for a in args)


def test_adjust_video_speed_boundary_ok(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"data")
    with patch("app.services.media.aget_ffmpeg_bin_path_data", return_value=None):
        with patch("app.services.media.subprocess.check_call"):
            adjust_video_speed(f, 0.5)  # should not raise
            adjust_video_speed(f, 2.0)  # should not raise


# ---------------------------------------------------------------------------
# get_upscayl_models / is_upscayl_binary_found
# ---------------------------------------------------------------------------

def test_get_upscayl_models_returns_7_items():
    models = get_upscayl_models()
    assert len(models) == 7
    assert "ultrasharp-4x" in models


def test_is_upscayl_binary_found_true():
    with patch.object(type(_UPSCAYL_BIN), "exists", return_value=True):
        assert is_upscayl_binary_found() is True


def test_is_upscayl_binary_found_false():
    with patch.object(type(_UPSCAYL_BIN), "exists", return_value=False):
        assert is_upscayl_binary_found() is False


# ---------------------------------------------------------------------------
# upscale_image
# ---------------------------------------------------------------------------

def test_upscale_image_invalid_scale_raises(tmp_path):
    f = tmp_path / "img.png"
    with pytest.raises(ValueError, match="scale must be"):
        upscale_image(f, "ultrasharp-4x", 5)


def test_upscale_image_invalid_model_raises(tmp_path):
    f = tmp_path / "img.png"
    with pytest.raises(ValueError, match="Unknown model"):
        upscale_image(f, "nonexistent-model", 4)


def test_upscale_image_binary_missing_raises(tmp_path):
    f = tmp_path / "img.png"
    f.write_bytes(b"data")
    with patch.object(type(_UPSCAYL_BIN), "exists", return_value=False):
        with pytest.raises(RuntimeError, match="upscayl-bin not found"):
            upscale_image(f, "ultrasharp-4x", 4)


def test_upscale_image_subprocess_failure_raises(tmp_path):
    f = tmp_path / "img.png"
    f.write_bytes(b"data")
    with patch.object(type(_UPSCAYL_BIN), "exists", return_value=True):
        with patch("app.services.media.subprocess.check_call",
                   side_effect=subprocess.CalledProcessError(1, "cmd")):
            with pytest.raises(RuntimeError, match="Upscaling failed"):
                upscale_image(f, "ultrasharp-4x", 4)


def test_upscale_image_no_output_raises(tmp_path):
    f = tmp_path / "img.png"
    f.write_bytes(b"data")
    # Patch the module-level _UPSCAYL_BIN so only binary.exists() returns True,
    # leaving other Path.exists() calls (e.g. output_path) unaffected.
    mock_bin = MagicMock(spec=Path)
    mock_bin.exists.return_value = True
    mock_bin.__str__ = MagicMock(return_value=str(tmp_path / "upscayl-bin"))
    with patch("app.services.media._UPSCAYL_BIN", mock_bin):
        with patch("app.services.media.subprocess.check_call"):
            # output file won't exist after mock check_call, so FileNotFoundError expected
            with pytest.raises(FileNotFoundError, match="no output file"):
                upscale_image(f, "ultrasharp-4x", 4)
