from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

import app.services.llm as llm_module
from app.services.llm import (
    get_default_model,
    get_ollama_url,
    get_status,
    generate,
    update_config,
)

# ---------------------------------------------------------------------------
# get_ollama_url / get_default_model
# ---------------------------------------------------------------------------

def test_get_ollama_url_default():
    """Returns the module-level default when no runtime override is set."""
    llm_module._runtime_config.clear()
    url = get_ollama_url()
    assert url == llm_module.OLLAMA_API_URL


def test_get_ollama_url_runtime_override():
    update_config(url="http://custom:9999")
    assert get_ollama_url() == "http://custom:9999"


def test_get_default_model_default():
    llm_module._runtime_config.clear()
    model = get_default_model()
    assert model == llm_module.DEFAULT_MODEL


def test_get_default_model_runtime_override():
    update_config(model="llama3:8b")
    assert get_default_model() == "llama3:8b"


# ---------------------------------------------------------------------------
# update_config
# ---------------------------------------------------------------------------

def test_update_config_url_only():
    llm_module._runtime_config.clear()
    original_model = get_default_model()
    update_config(url="http://new-host:11434")
    assert get_ollama_url() == "http://new-host:11434"
    assert get_default_model() == original_model


def test_update_config_model_only():
    llm_module._runtime_config.clear()
    original_url = get_ollama_url()
    update_config(model="mistral")
    assert get_default_model() == "mistral"
    assert get_ollama_url() == original_url


def test_update_config_strips_whitespace():
    update_config(url="  http://host:11434  ", model="  gemma  ")
    assert get_ollama_url() == "http://host:11434"
    assert get_default_model() == "gemma"


def test_update_config_none_values_no_change():
    update_config(url="http://keep:11434", model="keep-model")
    update_config(url=None, model=None)
    assert get_ollama_url() == "http://keep:11434"
    assert get_default_model() == "keep-model"


# ---------------------------------------------------------------------------
# get_status — requests not installed
# ---------------------------------------------------------------------------

def test_get_status_requests_not_installed():
    original = sys.modules.get("requests")
    try:
        sys.modules["requests"] = None  # type: ignore[assignment]
        result = get_status()
    finally:
        if original is None:
            sys.modules.pop("requests", None)
        else:
            sys.modules["requests"] = original
    assert result.get("status") == "error"


# ---------------------------------------------------------------------------
# get_status — network errors
# ---------------------------------------------------------------------------

def _make_requests_mock(side_effect=None, json_data=None):
    mock_req = MagicMock()
    if side_effect:
        mock_req.get.side_effect = side_effect
    else:
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.ok = True
        resp.json.return_value = json_data or {}
        mock_req.get.return_value = resp
        mock_req.exceptions.ConnectionError = ConnectionError
        mock_req.exceptions.Timeout = TimeoutError
    # Set exception classes on mock
    mock_req.exceptions = MagicMock()
    mock_req.exceptions.ConnectionError = ConnectionError
    mock_req.exceptions.Timeout = TimeoutError
    return mock_req


def test_get_status_connection_error():
    mock_req = MagicMock()
    mock_req.exceptions.ConnectionError = ConnectionError
    mock_req.exceptions.Timeout = TimeoutError
    mock_req.get.side_effect = ConnectionError("refused")

    with patch.dict(sys.modules, {"requests": mock_req}):
        result = get_status()
    assert result["status"] == "unreachable"


def test_get_status_timeout():
    mock_req = MagicMock()
    mock_req.exceptions.ConnectionError = ConnectionError
    mock_req.exceptions.Timeout = TimeoutError
    mock_req.get.side_effect = TimeoutError("timed out")

    with patch.dict(sys.modules, {"requests": mock_req}):
        result = get_status()
    assert result["status"] == "timeout"


def test_get_status_success():
    mock_req = MagicMock()
    mock_req.exceptions.ConnectionError = ConnectionError
    mock_req.exceptions.Timeout = TimeoutError

    tags_resp = MagicMock()
    tags_resp.raise_for_status.return_value = None
    tags_resp.json.return_value = {"models": [{"name": "llama3"}, {"name": "mistral"}]}

    version_resp = MagicMock()
    version_resp.ok = True
    version_resp.json.return_value = {"version": "0.3.0"}

    mock_req.get.side_effect = [tags_resp, version_resp]

    with patch.dict(sys.modules, {"requests": mock_req}):
        result = get_status()

    assert result["connected"] is True
    assert "llama3" in result["models"]
    assert result["status"] == "ok"


def test_get_status_has_required_keys():
    mock_req = MagicMock()
    mock_req.exceptions.ConnectionError = ConnectionError
    mock_req.exceptions.Timeout = TimeoutError
    mock_req.get.side_effect = ConnectionError()

    with patch.dict(sys.modules, {"requests": mock_req}):
        result = get_status()

    for key in ("engine", "url", "default_model", "connected", "models"):
        assert key in result


# ---------------------------------------------------------------------------
# generate
# ---------------------------------------------------------------------------

def _mock_requests_post(response_json: dict):
    mock_req = MagicMock()
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = response_json
    mock_req.post.return_value = resp
    mock_req.exceptions.HTTPError = Exception
    return mock_req


def test_generate_uses_default_model():
    llm_module._runtime_config.clear()
    mock_req = _mock_requests_post({"response": "ok"})
    with patch.dict(sys.modules, {"requests": mock_req}):
        generate(prompt="", input_text="hello")
    call_kwargs = mock_req.post.call_args
    json_body = call_kwargs[1]["json"]
    assert json_body["model"] == llm_module.DEFAULT_MODEL


def test_generate_custom_model_used():
    mock_req = _mock_requests_post({"response": "ok"})
    with patch.dict(sys.modules, {"requests": mock_req}):
        generate(prompt="", input_text="hello", model="gemma2")
    json_body = mock_req.post.call_args[1]["json"]
    assert json_body["model"] == "gemma2"


def test_generate_combined_prompt():
    mock_req = _mock_requests_post({"response": "result"})
    with patch.dict(sys.modules, {"requests": mock_req}):
        generate(prompt="System prompt", input_text="User input")
    json_body = mock_req.post.call_args[1]["json"]
    assert json_body["prompt"] == "System prompt\n\nUser input"


def test_generate_empty_prompt_no_newlines():
    mock_req = _mock_requests_post({"response": "result"})
    with patch.dict(sys.modules, {"requests": mock_req}):
        generate(prompt="", input_text="User input")
    json_body = mock_req.post.call_args[1]["json"]
    assert json_body["prompt"] == "User input"


def test_generate_returns_response_field():
    mock_req = _mock_requests_post({"response": "Hello, world!"})
    with patch.dict(sys.modules, {"requests": mock_req}):
        result = generate(prompt="", input_text="hi")
    assert result == "Hello, world!"


def test_generate_raises_on_http_error():
    mock_req = MagicMock()
    mock_req.exceptions.HTTPError = RuntimeError
    resp = MagicMock()
    resp.raise_for_status.side_effect = RuntimeError("400 Bad Request")
    mock_req.post.return_value = resp
    with patch.dict(sys.modules, {"requests": mock_req}):
        with pytest.raises(RuntimeError):
            generate(prompt="", input_text="test")
