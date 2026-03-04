from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services.llm import generate, get_default_model, get_ollama_url, get_status, update_config

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])

_PROMPT_FILE = Path(__file__).resolve().parent.parent.parent.parent.parent / "client" / "public" / "llm_prompt.json"


@router.get("/status")
def llm_status() -> dict:
    """Check Ollama server connectivity and list available models."""
    return get_status()


@router.get("/config")
def llm_get_config() -> dict:
    """Return current Ollama runtime configuration."""
    return {"url": get_ollama_url(), "model": get_default_model()}


@router.put("/config")
def llm_update_config(payload: dict = Body(...)) -> dict:
    """Update Ollama runtime configuration (URL and/or default model)."""
    url = payload.get("url")
    model = payload.get("model")
    if url is not None and not isinstance(url, str):
        raise HTTPException(status_code=400, detail="url must be a string")
    if model is not None and not isinstance(model, str):
        raise HTTPException(status_code=400, detail="model must be a string")
    update_config(url=url, model=model)
    return {"status": "ok", "url": get_ollama_url(), "model": get_default_model()}


@router.get("/prompts")
def llm_get_prompts() -> list:
    """Return the prompt templates from llm_prompt.json."""
    if not _PROMPT_FILE.exists():
        raise HTTPException(status_code=404, detail="llm_prompt.json not found")
    try:
        data = json.loads(_PROMPT_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("Expected a JSON array")
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/prompts")
def llm_save_prompts(payload: list[Any] = Body(...)) -> dict:
    """Overwrite llm_prompt.json with the given prompt templates array."""
    try:
        _PROMPT_FILE.parent.mkdir(parents=True, exist_ok=True)
        _PROMPT_FILE.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch/preview")
def llm_batch_preview(payload: dict = Body(...)) -> dict:
    """Build final_prompt for each entry without calling Ollama."""
    data: dict = payload.get("data", {})
    prompt: str = payload.get("prompt", "")
    result: dict[str, Any] = {}
    for key, input_text in data.items():
        final_prompt = f"{prompt}\n\n{input_text}" if prompt else input_text
        result[key] = final_prompt
    return result


@router.post("/batch/generate")
def llm_batch_generate(payload: dict = Body(...)) -> dict:
    """Run Ollama on each entry sequentially and return all outputs."""
    data: dict = payload.get("data", {})
    prompt: str = payload.get("prompt", "")
    model: str | None = payload.get("model") or None
    result: dict[str, Any] = {}
    for key, input_text in data.items():
        try:
            output = generate(prompt, str(input_text), model)
            result[key] = output
        except Exception as exc:
            result[key] = f"[ERROR] {exc}"
    return result


@router.post("/generate")
def llm_generate(payload: dict = Body(...)) -> dict:
    prompt = payload.get("prompt", "")
    input_text = payload.get("input_text", "")
    model = payload.get("model") or None

    if not input_text:
        raise HTTPException(status_code=400, detail="input_text is required")

    try:
        output = generate(prompt, input_text, model)
        return {"status": "ok", "output": output}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
