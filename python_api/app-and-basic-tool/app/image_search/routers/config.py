"""API-key management router.

Keys are stored in the OS credential manager (Windows Credential Manager,
macOS Keychain, Linux Secret Service) via the ``keyring`` library.  This
keeps secrets encrypted at rest and scoped to the current OS user.

Security considerations
-----------------------
* The full key is **never** returned by any GET endpoint — only a masked
  representation (first 4 + last 4 characters) is sent to the client.
* Keys are stored in the OS-level encrypted credential store; they are
  **not** embedded in the frontend bundle or written to plaintext files.
* An empty / whitespace-only value deletes the key.
* Falls back to ``os.environ`` when ``keyring`` is unavailable.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Body, HTTPException

from ..services.credentials import (
    delete_credential,
    get_all_status,
    get_credential,
    set_credential,
    _mask,
)


router = APIRouter(prefix="/config", tags=["config"])

_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{10,128}$")


def _validate_key(raw: str) -> None:
    """Raise 400 if *raw* doesn't match the allowed key format."""
    if raw and not _KEY_RE.match(raw):
        raise HTTPException(
            status_code=400,
            detail="Invalid key format. The key should be 10-128 alphanumeric characters.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/api-keys")
def get_api_keys() -> dict:
    """Return the configuration status of all known API keys (masked)."""
    status = get_all_status()
    return {
        "unsplash": status.get("UNSPLASH_ACCESS_KEY", {"configured": False, "masked": ""}),
        "pexels": status.get("PEXELS_API_KEY", {"configured": False, "masked": ""}),
        "lexica": status.get("LEXICA_API_KEY", {"configured": False, "masked": ""}),
    }


@router.put("/api-keys/unsplash")
def set_unsplash_key(payload: dict = Body(...)) -> dict:
    """Save or remove the Unsplash API key.

    Send ``{"key": "<your-key>"}`` to set, or ``{"key": ""}`` to remove.
    """
    raw = str(payload.get("key") or "").strip()
    _validate_key(raw)
    set_credential("UNSPLASH_ACCESS_KEY", raw)
    return {
        "status": "ok",
        "configured": bool(raw),
        "masked": _mask(raw) if raw else "",
    }


@router.put("/api-keys/pexels")
def set_pexels_key(payload: dict = Body(...)) -> dict:
    """Save or remove the Pexels API key.

    Send ``{"key": "<your-key>"}`` to set, or ``{"key": ""}`` to remove.
    """
    raw = str(payload.get("key") or "").strip()
    _validate_key(raw)
    set_credential("PEXELS_API_KEY", raw)
    return {
        "status": "ok",
        "configured": bool(raw),
        "masked": _mask(raw) if raw else "",
    }


@router.put("/api-keys/lexica")
def set_lexica_key(payload: dict = Body(...)) -> dict:
    """Save or remove the Lexica API key.

    Send ``{"key": "<your-key>"}`` to set, or ``{"key": ""}`` to remove.
    """
    raw = str(payload.get("key") or "").strip()
    _validate_key(raw)
    set_credential("LEXICA_API_KEY", raw)
    return {
        "status": "ok",
        "configured": bool(raw),
        "masked": _mask(raw) if raw else "",
    }

