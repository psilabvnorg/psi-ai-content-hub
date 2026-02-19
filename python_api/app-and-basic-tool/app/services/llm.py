from __future__ import annotations

import os

import requests

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://172.18.96.1:11434")


def get_status() -> dict:
    """Check connectivity and retrieve available models from the Ollama server."""
    try:
        resp = requests.get(f"{OLLAMA_API_URL}/api/tags", timeout=10)
        resp.raise_for_status()
        models = [m.get("name") for m in resp.json().get("models", [])]
        return {"status": "ok", "url": OLLAMA_API_URL, "models": models}
    except requests.exceptions.ConnectionError:
        return {"status": "unreachable", "url": OLLAMA_API_URL, "models": []}
    except requests.exceptions.Timeout:
        return {"status": "timeout", "url": OLLAMA_API_URL, "models": []}
    except Exception as exc:
        return {"status": "error", "url": OLLAMA_API_URL, "models": [], "detail": str(exc)}


def generate(prompt: str, input_text: str, model: str = "deepseek-r1:8b") -> str:
    """Call Ollama API to generate text."""
    full_prompt = f"{prompt}\n\n{input_text}" if prompt else input_text

    resp = requests.post(
        f"{OLLAMA_API_URL}/api/generate",
        json={"model": model, "prompt": full_prompt, "stream": False},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json().get("response", "")
