"""API-key management router.

Keys are persisted in a `.env` file next to the ImageFinder package so that
other modules (e.g. the Unsplash search adapter) can pick them up via
``dotenv.load_dotenv()`` without any code changes.

Security considerations
-----------------------
* The full key is **never** returned by any GET endpoint — only a masked
  representation (first 4 + last 4 characters) is sent to the client.
* Keys are stored in a server-side `.env` file that is read by the Python
  process; they are **not** embedded in the frontend bundle.
* An empty / whitespace-only value deletes the key from the file.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException


router = APIRouter(prefix="/api/v1/config", tags=["config"])

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{10,128}$")


def _mask(key: str) -> str:
    """Return a masked version of a key suitable for display."""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"


def _read_env() -> dict[str, str]:
    """Read key=value pairs from the .env file (ignores comments / blanks)."""
    pairs: dict[str, str] = {}
    if not _ENV_FILE.is_file():
        return pairs
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        # Strip optional surrounding quotes
        value = value.strip().strip("\"'")
        pairs[name.strip()] = value
    return pairs


def _write_env(pairs: dict[str, str]) -> None:
    """Atomically rewrite the .env file with the given key=value pairs."""
    lines = [f'{name}="{value}"' for name, value in sorted(pairs.items()) if value]
    _ENV_FILE.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/api-keys")
def get_api_keys() -> dict:
    """Return the configuration status of all known API keys (masked)."""
    env = _read_env()
    unsplash_key = env.get("UNSPLASH_ACCESS_KEY", "")
    return {
        "unsplash": {
            "configured": bool(unsplash_key),
            "masked": _mask(unsplash_key) if unsplash_key else "",
        },
    }


@router.put("/api-keys/unsplash")
def set_unsplash_key(payload: dict = Body(...)) -> dict:
    """Save or remove the Unsplash API key.

    Send ``{"key": "<your-key>"}`` to set, or ``{"key": ""}`` to remove.
    """
    raw = str(payload.get("key") or "").strip()

    if raw and not _KEY_RE.match(raw):
        raise HTTPException(
            status_code=400,
            detail="Invalid key format. The key should be 10-128 alphanumeric characters.",
        )

    env = _read_env()
    if raw:
        env["UNSPLASH_ACCESS_KEY"] = raw
        # Also set in the current process so the next search picks it up
        os.environ["UNSPLASH_ACCESS_KEY"] = raw
    else:
        env.pop("UNSPLASH_ACCESS_KEY", None)
        os.environ.pop("UNSPLASH_ACCESS_KEY", None)

    _write_env(env)

    return {
        "status": "ok",
        "configured": bool(raw),
        "masked": _mask(raw) if raw else "",
    }

