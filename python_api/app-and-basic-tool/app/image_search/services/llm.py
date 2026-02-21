from __future__ import annotations

import os

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "deepseek-r1:8b")


def get_status() -> dict:
    """Check connectivity and retrieve available models from the local Ollama server."""
    base = {
        "engine": "ollama",
        "url": OLLAMA_API_URL,
        "default_model": DEFAULT_MODEL,
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
        resp = requests.get(f"{OLLAMA_API_URL}/api/tags", timeout=10)
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
        ver_resp = requests.get(f"{OLLAMA_API_URL}/api/version", timeout=5)
        if ver_resp.ok:
            base["version"] = ver_resp.json().get("version")
    except Exception:
        pass

    return base


def generate(prompt: str, input_text: str, model: str = DEFAULT_MODEL) -> str:
    """Call Ollama API to generate text."""
    import requests
    full_prompt = f"{prompt}\n\n{input_text}" if prompt else input_text

    resp = requests.post(
        f"{OLLAMA_API_URL}/api/generate",
        json={"model": model, "prompt": full_prompt, "stream": False},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json().get("response", "")

