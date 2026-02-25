from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..services.sources import list_sources, search_source


router = APIRouter(prefix="/sources", tags=["sources"])


def _parse_int(value: object, field_name: str, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")


@router.get("")
def list_sources_route() -> dict:
    return list_sources()


@router.post("/{source_id}/search")
def search_single_source(source_id: str, payload: dict = Body(...)) -> dict:
    query = str(payload.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    max_results = max(1, min(20, _parse_int(payload.get("max_results"), "max_results", 10)))
    timeout_seconds = max(5, min(120, _parse_int(payload.get("timeout_seconds"), "timeout_seconds", 30)))

    try:
        return search_source(source_id, query, max_results, timeout_seconds)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
