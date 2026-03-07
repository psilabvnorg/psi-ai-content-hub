from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from python_api.common.jobs import JobStore

from ..deps import get_job_store
from ..services import remotion_platform


router = APIRouter(tags=["remotion-platform"])


def _to_file(upload: UploadFile) -> remotion_platform.UploadedFileData:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="file is empty")
    return remotion_platform.UploadedFileData(
        filename=upload.filename,
        content_type=upload.content_type,
        data=data,
    )


@router.get("/api/v1/templates")
def list_templates() -> dict:
    return remotion_platform.get_template_catalog()


@router.get("/api/v1/templates/{preset_id:path}")
def get_template(preset_id: str) -> dict:
    try:
        return remotion_platform.get_template_details(preset_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/template-families")
def list_template_families() -> dict:
    return {"families": remotion_platform.get_template_catalog(include_internal=True)["families"]}


@router.post("/api/v1/assets")
def upload_asset(file: UploadFile = File(...)) -> dict:
    try:
        return remotion_platform.upload_library_asset(_to_file(file))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/v1/assets")
def list_assets() -> dict:
    return {"assets": remotion_platform.list_library_assets()}


@router.get("/api/v1/assets/{asset_id}/file")
def get_asset_file(asset_id: str) -> FileResponse:
    try:
        return FileResponse(remotion_platform.get_library_asset_file(asset_id))
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/v1/asset-packs")
def save_asset_pack(payload: dict) -> dict:
    return remotion_platform.save_asset_pack(payload)


@router.get("/api/v1/asset-packs")
def list_asset_packs() -> dict:
    return remotion_platform.list_asset_packs()


@router.post("/api/v1/projects")
def create_project(payload: dict) -> dict:
    return remotion_platform.create_project(payload)


@router.patch("/api/v1/projects/{project_id}")
def update_project(project_id: str, payload: dict) -> dict:
    try:
        return remotion_platform.update_project(project_id, payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/projects/{project_id}")
def load_project(project_id: str) -> dict:
    try:
        return remotion_platform.load_project(project_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/v1/projects/{project_id}/preview")
def preview_project(project_id: str) -> dict:
    try:
        return remotion_platform.create_project_preview(project_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/v1/projects/{project_id}/render")
def render_project(project_id: str, job_store: JobStore = Depends(get_job_store)) -> dict:
    try:
        task_id = remotion_platform.start_project_render(job_store=job_store, project_id=project_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task_id": task_id}


@router.get("/api/v1/projects/render/stream/{task_id}")
def project_render_stream(task_id: str) -> StreamingResponse:
    return StreamingResponse(
        remotion_platform.render_progress_store.sse_stream(task_id),
        media_type="text/event-stream",
    )


@router.get("/api/v1/projects/render/result/{task_id}")
def project_render_result(task_id: str) -> dict:
    payload = remotion_platform.get_render_result(task_id)
    if not payload:
        raise HTTPException(status_code=404, detail="result not found")
    return payload


@router.get("/api/v1/workspaces/{workspace_id}/manifest")
def get_workspace_manifest(workspace_id: str) -> dict:
    try:
        return remotion_platform.get_workspace_manifest(workspace_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/workspaces/{workspace_id}/files/{relative_path:path}")
def get_workspace_file(workspace_id: str, relative_path: str) -> FileResponse:
    try:
        return FileResponse(remotion_platform.get_workspace_file(workspace_id, relative_path))
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/remotion/assets/{asset_path:path}")
def get_builtin_asset(asset_path: str) -> FileResponse:
    try:
        return FileResponse(remotion_platform.resolve_builtin_asset_path(asset_path))
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
