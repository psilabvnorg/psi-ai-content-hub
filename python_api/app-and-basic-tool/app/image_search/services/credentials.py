"""Secure credential storage using the OS keyring.

API keys are stored in the operating-system credential manager
(Windows Credential Manager, macOS Keychain, Linux Secret Service)
via the ``keyring`` library.  This keeps secrets encrypted at rest
and scoped to the current OS user — no plaintext ``.env`` files.

If ``keyring`` is unavailable (e.g. headless CI), the module falls
back to ``os.getenv`` so existing ``.env``-based workflows still work.
"""

from __future__ import annotations

import logging
import os

LOGGER = logging.getLogger(__name__)

_SERVICE_NAME = "psi-ai-content-hub"

# Known credential keys and their corresponding env-var names.
KNOWN_KEYS: dict[str, str] = {
    "UNSPLASH_ACCESS_KEY": "UNSPLASH_ACCESS_KEY",
    "PEXELS_API_KEY": "PEXELS_API_KEY",
    "LEXICA_API_KEY": "LEXICA_API_KEY",
}

# ---------------------------------------------------------------------------
# Lazy keyring import — gracefully degrade when the package is missing or
# when the OS backend is broken (e.g. headless Linux without Secret Service).
# ---------------------------------------------------------------------------

_keyring_available: bool | None = None


def _ensure_keyring() -> bool:
    """Return ``True`` if the keyring backend is usable."""
    global _keyring_available
    if _keyring_available is not None:
        return _keyring_available
    try:
        import keyring as _kr  # noqa: F401
        # Attempt a harmless read to verify the backend is functional.
        _kr.get_password(_SERVICE_NAME, "__probe__")
        _keyring_available = True
    except Exception as exc:
        LOGGER.warning("keyring unavailable, falling back to env vars: %s", exc)
        _keyring_available = False
    return _keyring_available


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_credential(name: str) -> str:
    """Retrieve a credential by *name*.

    Lookup order:
    1. OS keyring (if available)
    2. ``os.environ`` / ``.env`` fallback

    @param name The credential key (e.g. ``"UNSPLASH_ACCESS_KEY"``).
    @return The credential value, or an empty string if not set.
    """
    if _ensure_keyring():
        import keyring
        value = keyring.get_password(_SERVICE_NAME, name)
        if value:
            return value

    # Fallback: environment variable (supports legacy .env usage).
    return (os.getenv(name) or "").strip()


def set_credential(name: str, value: str) -> None:
    """Store a credential securely.

    Saves into the OS keyring **and** sets ``os.environ`` so that the
    current process (and any child processes) can use it immediately.

    @param name The credential key.
    @param value The secret value.  An empty string removes the credential.
    """
    if _ensure_keyring():
        import keyring
        if value:
            keyring.set_password(_SERVICE_NAME, name, value)
        else:
            try:
                keyring.delete_password(_SERVICE_NAME, name)
            except keyring.errors.PasswordDeleteError:
                pass  # Key didn't exist — nothing to remove.

    # Keep os.environ in sync for the current process lifetime.
    if value:
        os.environ[name] = value
    else:
        os.environ.pop(name, None)


def delete_credential(name: str) -> None:
    """Remove a credential from both keyring and environment.

    @param name The credential key to remove.
    """
    set_credential(name, "")


def get_all_status() -> dict[str, dict[str, object]]:
    """Return configuration status (masked) for all known API keys.

    @return A dict keyed by short name with ``configured`` and ``masked`` fields.
    """
    result: dict[str, dict[str, object]] = {}
    for name in KNOWN_KEYS:
        raw = get_credential(name)
        result[name] = {
            "configured": bool(raw),
            "masked": _mask(raw) if raw else "",
        }
    return result


def _mask(key: str) -> str:
    """Return a masked version of a key suitable for display."""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"
