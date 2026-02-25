from __future__ import annotations

import subprocess

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.aenv_profile_service_api import (
    aenv_get_profile_catalog_data,
    aenv_get_profile_status_data,
    aenv_install_profile_data,
)


router = APIRouter(prefix="/api/v1/env/profiles", tags=["env"])


class aenv_install_profile_request_dto(BaseModel):
    package_list: list[str] | None = Field(default=None)


@router.get("")
def aenv_list_profile_catalog() -> dict[str, object]:
    return {"status": "ok", "profile_list": aenv_get_profile_catalog_data()}


@router.get("/{profile_id}/status")
def aenv_get_profile_status(profile_id: str) -> dict[str, object]:
    try:
        status_payload = aenv_get_profile_status_data(profile_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", "profile_status": status_payload}


@router.post("/{profile_id}/install")
def aenv_install_profile(profile_id: str, payload: aenv_install_profile_request_dto | None = None) -> dict[str, object]:
    try:
        install_payload = aenv_install_profile_data(profile_id, packages=(payload.package_list if payload else None))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"pip install failed with exit code {exc.returncode}") from exc
    return {"status": "ok", "install_result": install_payload}
