from __future__ import annotations

import os

import requests

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://172.18.96.1:11434")


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
