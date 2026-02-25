from __future__ import annotations

import os

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://172.18.96.1:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "deepseek-r1:8b")

# Runtime config — overrides env-based defaults when set via the API.
_runtime_config: dict[str, str] = {}


def get_ollama_url() -> str:
    return _runtime_config.get("url", OLLAMA_API_URL)


def get_default_model() -> str:
    return _runtime_config.get("model", DEFAULT_MODEL)


def update_config(url: str | None = None, model: str | None = None) -> None:
    if url is not None:
        _runtime_config["url"] = url.strip()
    if model is not None:
        _runtime_config["model"] = model.strip()


def get_status() -> dict:
    """Check connectivity and retrieve available models from the Ollama server."""
    url = get_ollama_url()
    default_model = get_default_model()
    base = {
        "engine": "ollama",
        "url": url,
        "default_model": default_model,
        "connected": False,
        "models": [],
        "version": None,
    }

    try:
        import requests
    except ModuleNotFoundError:
        base["status"] = "error"
        base["detail"] = "requests package not installed — run Install Environment first"
        return base

    try:
        resp = requests.get(f"{url}/api/tags", timeout=10)
        resp.raise_for_status()
        models = [m.get("name") for m in resp.json().get("models", [])]
        base["connected"] = True
        base["models"] = models
        base["status"] = "ok"
    except requests.exceptions.ConnectionError:
        base["status"] = "unreachable"
        return base
    except requests.exceptions.Timeout:
        base["status"] = "timeout"
        return base
    except Exception as exc:
        base["status"] = "error"
        base["detail"] = str(exc)
        return base

    try:
        ver_resp = requests.get(f"{url}/api/version", timeout=5)
        if ver_resp.ok:
            base["version"] = ver_resp.json().get("version")
    except Exception:
        pass

    return base


def generate(prompt: str, input_text: str, model: str | None = None) -> str:
    """Call Ollama API to generate text."""
    import requests

    url = get_ollama_url()
    resolved_model = model if model else get_default_model()
    full_prompt = f"{prompt}\n\n{input_text}" if prompt else input_text

    resp = requests.post(
        f"{url}/api/generate",
        json={"model": resolved_model, "prompt": full_prompt, "stream": False},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json().get("response", "")
