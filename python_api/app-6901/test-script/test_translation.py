from __future__ import annotations

import gc
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import app.services.translation as tr_module
from app.services.translation import (
    _detect_runtime_device,
    _model_downloaded,
    get_model_status,
    unload_model,
)


# ---------------------------------------------------------------------------
# _detect_runtime_device
# ---------------------------------------------------------------------------

def test_detect_runtime_device_returns_tuple():
    device, gpu_name = _detect_runtime_device()
    assert device in ("cpu", "cuda")
    # gpu_name is either a string or None
    assert gpu_name is None or isinstance(gpu_name, str)


def test_detect_runtime_device_cpu_when_no_cuda():
    """On machines without GPU (typical CI), should return cpu."""
    import torch
    if not torch.cuda.is_available():
        device, gpu_name = _detect_runtime_device()
        assert device == "cpu"
        assert gpu_name is None


def test_detect_runtime_device_exception_returns_cpu():
    """Any exception during torch detection falls back to cpu."""
    import sys
    # torch is imported inside the function body, so patch sys.modules directly
    mock_torch = MagicMock()
    mock_torch.cuda.is_available.side_effect = RuntimeError("cuda error")
    with patch.dict(sys.modules, {"torch": mock_torch}):
        device, gpu_name = _detect_runtime_device()
    assert device == "cpu"
    assert gpu_name is None


# ---------------------------------------------------------------------------
# _model_downloaded
# ---------------------------------------------------------------------------

def test_model_downloaded_no_dir(tmp_path):
    nonexistent = tmp_path / "no_dir"
    with patch.object(tr_module, "MODEL_DIR", nonexistent):
        assert _model_downloaded() is False


def test_model_downloaded_empty_dir(tmp_path):
    empty_dir = tmp_path / "model"
    empty_dir.mkdir()
    with patch.object(tr_module, "MODEL_DIR", empty_dir):
        assert _model_downloaded() is False


def test_model_downloaded_with_config_json(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}")
    with patch.object(tr_module, "MODEL_DIR", model_dir):
        assert _model_downloaded() is True


def test_model_downloaded_with_safetensors_file(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "model.safetensors").write_bytes(b"weights")
    with patch.object(tr_module, "MODEL_DIR", model_dir):
        assert _model_downloaded() is True


def test_model_downloaded_with_bin_file(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "pytorch_model.bin").write_bytes(b"weights")
    with patch.object(tr_module, "MODEL_DIR", model_dir):
        assert _model_downloaded() is True


def test_model_downloaded_with_unrelated_file(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "readme.txt").write_text("readme")
    with patch.object(tr_module, "MODEL_DIR", model_dir):
        assert _model_downloaded() is False


# ---------------------------------------------------------------------------
# get_model_status
# ---------------------------------------------------------------------------

def test_get_model_status_not_loaded():
    with patch.object(tr_module, "_model", None):
        with patch.object(tr_module, "_tokenizer", None):
            result = get_model_status()
    assert result["loaded"] is False


def test_get_model_status_loaded():
    with patch.object(tr_module, "_model", MagicMock()):
        with patch.object(tr_module, "_tokenizer", MagicMock()):
            result = get_model_status()
    assert result["loaded"] is True


def test_get_model_status_partial_load():
    """If only _model is set but _tokenizer is None, loaded should be False."""
    with patch.object(tr_module, "_model", MagicMock()):
        with patch.object(tr_module, "_tokenizer", None):
            result = get_model_status()
    assert result["loaded"] is False


def test_get_model_status_structure(tmp_path):
    with patch.object(tr_module, "_model", None):
        with patch.object(tr_module, "_tokenizer", None):
            with patch.object(tr_module, "MODEL_DIR", tmp_path):
                result = get_model_status()
    for key in ("loaded", "downloaded", "model_id", "model_dir", "device", "supported_languages"):
        assert key in result, f"Missing key: {key}"


def test_get_model_status_model_id_is_nllb():
    with patch.object(tr_module, "_model", None):
        result = get_model_status()
    assert "nllb" in result["model_id"].lower()


def test_get_model_status_supported_languages_dict():
    with patch.object(tr_module, "_model", None):
        result = get_model_status()
    assert isinstance(result["supported_languages"], dict)
    assert "vi" in result["supported_languages"]
    assert "en" in result["supported_languages"]


# ---------------------------------------------------------------------------
# unload_model
# ---------------------------------------------------------------------------

def test_unload_model_when_loaded():
    original_model = tr_module._model
    original_tokenizer = tr_module._tokenizer
    tr_module._model = MagicMock()
    tr_module._tokenizer = MagicMock()
    try:
        result = unload_model()
        assert result["status"] == "unloaded"
        assert tr_module._model is None
        assert tr_module._tokenizer is None
    finally:
        tr_module._model = original_model
        tr_module._tokenizer = original_tokenizer


def test_unload_model_when_not_loaded():
    with patch.object(tr_module, "_model", None):
        with patch.object(tr_module, "_tokenizer", None):
            result = unload_model()
    assert result["status"] == "not_loaded"


def test_unload_model_gc_collect_called():
    original_model = tr_module._model
    original_tokenizer = tr_module._tokenizer
    tr_module._model = MagicMock()
    tr_module._tokenizer = MagicMock()
    try:
        with patch("app.services.translation.gc.collect") as mock_gc:
            unload_model()
        mock_gc.assert_called_once()
    finally:
        tr_module._model = original_model
        tr_module._tokenizer = original_tokenizer


def test_unload_model_clears_current_device():
    original_model = tr_module._model
    original_tokenizer = tr_module._tokenizer
    original_device = tr_module._current_device
    tr_module._model = MagicMock()
    tr_module._tokenizer = MagicMock()
    tr_module._current_device = "cpu"
    try:
        unload_model()
        assert tr_module._current_device is None
    finally:
        tr_module._model = original_model
        tr_module._tokenizer = original_tokenizer
        tr_module._current_device = original_device
