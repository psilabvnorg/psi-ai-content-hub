from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..services.llm import generate, get_default_model, get_ollama_url, get_status, update_config

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])


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
