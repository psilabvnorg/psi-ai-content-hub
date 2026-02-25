from __future__ import annotations

from fastapi import APIRouter, Body

from ..services.env import get_status, install_packages


router = APIRouter(prefix="/api/v1/env", tags=["env"])


@router.get("/status")
def env_status() -> dict:
    return get_status()


@router.post("/install")
def env_install(payload: dict = Body(None)) -> dict:
    packages = (payload or {}).get("packages") or None
    return install_packages(packages)
