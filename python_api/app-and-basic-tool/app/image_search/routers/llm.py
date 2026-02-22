from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..services.llm import DEFAULT_MODEL, generate, get_status


router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/status")
def llm_status() -> dict:
    """Check local Ollama server connectivity, version, and list available models."""
    return get_status()


@router.post("/generate")
def llm_generate(payload: dict = Body(...)) -> dict:
    prompt = payload.get("prompt", "")
    input_text = payload.get("input_text", "")
    model = payload.get("model") or DEFAULT_MODEL

    if not input_text:
        raise HTTPException(status_code=400, detail="input_text is required")

    try:
        output = generate(prompt, input_text, model)
        return {"status": "ok", "output": output}
    except Exception as exc:  # pragma: no cover - passthrough to API caller
        raise HTTPException(status_code=500, detail=str(exc))

