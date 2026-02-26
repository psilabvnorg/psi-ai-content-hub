from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.edge_tts import (
    _get_edge_tts_module,
    _normalize_voice,
    list_voices,
    list_languages,
    synthesize_to_mp3,
)

# ---------------------------------------------------------------------------
# _get_edge_tts_module
# ---------------------------------------------------------------------------

def test_get_edge_tts_module_success():
    mock_mod = MagicMock()
    with patch("app.services.edge_tts.importlib.import_module", return_value=mock_mod):
        result = _get_edge_tts_module()
    assert result is mock_mod


def test_get_edge_tts_module_import_error_raises_runtime():
    with patch("app.services.edge_tts.importlib.import_module", side_effect=ImportError("no edge_tts")):
        with pytest.raises(RuntimeError, match="edge-tts is not installed"):
            _get_edge_tts_module()


# ---------------------------------------------------------------------------
# _normalize_voice  (pure function — no mocks needed)
# ---------------------------------------------------------------------------

def test_normalize_voice_full_fields():
    raw = {
        "ShortName": "vi-VN-HoaiMyNeural",
        "Locale": "vi-VN",
        "Gender": "Female",
        "FriendlyName": "Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)",
    }
    result = _normalize_voice(raw)
    assert result["id"] == "vi-VN-HoaiMyNeural"
    assert result["locale"] == "vi-VN"
    assert result["gender"] == "Female"
    assert "HoaiMy" in result["name"]


def test_normalize_voice_missing_friendly_name():
    raw = {
        "ShortName": "en-US-GuyNeural",
        "Locale": "en-US",
        "Gender": "Male",
    }
    result = _normalize_voice(raw)
    # Falls back to ShortName
    assert result["name"] == "en-US-GuyNeural"


def test_normalize_voice_strips_whitespace():
    raw = {
        "ShortName": "  en-US-Guy  ",
        "Locale": " en-US ",
        "Gender": " Male ",
        "FriendlyName": "  Guy  ",
    }
    result = _normalize_voice(raw)
    assert result["id"] == "en-US-Guy"
    assert result["locale"] == "en-US"
    assert result["gender"] == "Male"
    assert result["name"] == "Guy"


def test_normalize_voice_empty_input():
    result = _normalize_voice({})
    assert result["id"] == ""
    assert result["locale"] == ""
    assert result["gender"] == ""
    assert result["name"] == ""


# ---------------------------------------------------------------------------
# list_voices — async (uses the real edge_tts via mock)
# ---------------------------------------------------------------------------

_SAMPLE_VOICES = [
    {"ShortName": "vi-VN-HoaiMyNeural", "Locale": "vi-VN", "Gender": "Female", "FriendlyName": "HoaiMy"},
    {"ShortName": "vi-VN-NamMinhNeural", "Locale": "vi-VN", "Gender": "Male", "FriendlyName": "NamMinh"},
    {"ShortName": "en-US-GuyNeural", "Locale": "en-US", "Gender": "Male", "FriendlyName": "Guy"},
    {"ShortName": "en-US-AriaNeural", "Locale": "en-US", "Gender": "Female", "FriendlyName": "Aria"},
    {"ShortName": "", "Locale": "ja-JP", "Gender": "Female", "FriendlyName": "Empty"},  # invalid: no id
    {"ShortName": "fr-FR-DeniseNeural", "Locale": "", "Gender": "Female", "FriendlyName": "Denise"},  # invalid: no locale
]


def _make_edge_tts_mock(voices=None):
    mod = MagicMock()
    mod.list_voices = AsyncMock(return_value=voices or _SAMPLE_VOICES)
    return mod


async def test_list_voices_no_filter():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_voices()
    # Should include valid voices only (exclude the two invalid ones)
    ids = [v["id"] for v in result]
    assert "vi-VN-HoaiMyNeural" in ids
    assert "en-US-GuyNeural" in ids
    # Invalid voices excluded
    assert "" not in ids
    assert "fr-FR-DeniseNeural" not in ids  # no locale


async def test_list_voices_language_filter():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_voices("vi")
    ids = [v["id"] for v in result]
    assert all(v["locale"].lower().startswith("vi") for v in result)
    assert "en-US-GuyNeural" not in ids


async def test_list_voices_each_has_required_fields():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_voices()
    for v in result:
        assert "id" in v
        assert "name" in v
        assert "locale" in v
        assert "gender" in v


async def test_list_voices_sorted_by_locale_then_name():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_voices()
    tuples = [(v["locale"], v["name"]) for v in result]
    assert tuples == sorted(tuples)


async def test_list_voices_filters_empty_id_and_locale():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_voices()
    for v in result:
        assert v["id"] != ""
        assert v["locale"] != ""


# ---------------------------------------------------------------------------
# list_languages — async
# ---------------------------------------------------------------------------

async def test_list_languages_returns_list():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_languages()
    assert isinstance(result, list)
    assert len(result) > 0


async def test_list_languages_has_voice_count_field():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_languages()
    for lang in result:
        assert "voice_count" in lang
        assert lang["voice_count"] > 0


async def test_list_languages_aggregates_correctly():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_languages()
    by_code = {lang["code"]: lang for lang in result}
    assert by_code["vi-VN"]["voice_count"] == 2
    assert by_code["en-US"]["voice_count"] == 2


async def test_list_languages_sorted_by_name():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock()):
        result = await list_languages()
    names = [lang["name"].lower() for lang in result]
    assert names == sorted(names)


async def test_list_languages_skips_empty_locale():
    voices_with_empty = _SAMPLE_VOICES + [
        {"ShortName": "xx-YY-Test", "Locale": "", "Gender": "Male", "FriendlyName": "Test"}
    ]
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=_make_edge_tts_mock(voices_with_empty)):
        result = await list_languages()
    codes = [lang["code"] for lang in result]
    assert "" not in codes


# ---------------------------------------------------------------------------
# synthesize_to_mp3 — async
# ---------------------------------------------------------------------------

async def test_synthesize_empty_voice_raises():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=MagicMock()):
        with pytest.raises(ValueError, match="voice is required"):
            await synthesize_to_mp3(text="Hello", voice="")


async def test_synthesize_empty_text_raises():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=MagicMock()):
        with pytest.raises(ValueError, match="text is required"):
            await synthesize_to_mp3(text="   ", voice="vi-VN-HoaiMyNeural")


async def test_synthesize_whitespace_voice_raises():
    with patch("app.services.edge_tts._get_edge_tts_module", return_value=MagicMock()):
        with pytest.raises(ValueError):
            await synthesize_to_mp3(text="Hello", voice="   ")


async def test_synthesize_rate_format_zero():
    mock_mod = MagicMock()
    communicator = MagicMock()
    communicator.save = AsyncMock()
    mock_mod.Communicate.return_value = communicator

    with patch("app.services.edge_tts._get_edge_tts_module", return_value=mock_mod):
        with patch("app.services.edge_tts.TEMP_DIR") as mock_dir:
            mock_dir.__truediv__ = lambda self, x: Path("/tmp") / x
            mock_dir.mkdir = MagicMock()
            await synthesize_to_mp3(text="Hello", voice="en-US-GuyNeural", rate=0, pitch=0)

    call_kwargs = mock_mod.Communicate.call_args[1]
    assert call_kwargs["rate"] == "+0%"
    assert call_kwargs["pitch"] == "+0Hz"


async def test_synthesize_negative_rate_format():
    mock_mod = MagicMock()
    communicator = MagicMock()
    communicator.save = AsyncMock()
    mock_mod.Communicate.return_value = communicator

    with patch("app.services.edge_tts._get_edge_tts_module", return_value=mock_mod):
        with patch("app.services.edge_tts.TEMP_DIR") as mock_dir:
            mock_dir.__truediv__ = lambda self, x: Path("/tmp") / x
            mock_dir.mkdir = MagicMock()
            await synthesize_to_mp3(text="Hello", voice="en-US-GuyNeural", rate=-5, pitch=-10)

    call_kwargs = mock_mod.Communicate.call_args[1]
    assert call_kwargs["rate"] == "-5%"
    assert call_kwargs["pitch"] == "-10Hz"


async def test_synthesize_returns_path_and_filename(tmp_path):
    mock_mod = MagicMock()
    communicator = MagicMock()
    communicator.save = AsyncMock()
    mock_mod.Communicate.return_value = communicator

    with patch("app.services.edge_tts._get_edge_tts_module", return_value=mock_mod):
        with patch("app.services.edge_tts.TEMP_DIR", tmp_path):
            path, filename = await synthesize_to_mp3(text="Hello", voice="en-US-GuyNeural")

    assert isinstance(path, Path)
    assert isinstance(filename, str)
    assert filename.endswith(".mp3")
    assert filename.startswith("edge_tts_")


async def test_synthesize_calls_communicate_save(tmp_path):
    mock_mod = MagicMock()
    communicator = MagicMock()
    communicator.save = AsyncMock()
    mock_mod.Communicate.return_value = communicator

    with patch("app.services.edge_tts._get_edge_tts_module", return_value=mock_mod):
        with patch("app.services.edge_tts.TEMP_DIR", tmp_path):
            path, filename = await synthesize_to_mp3(text="Test text", voice="en-US-GuyNeural")

    communicator.save.assert_called_once_with(str(tmp_path / filename))
