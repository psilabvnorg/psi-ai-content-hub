from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import (
    EXPORTS_DIR,
    LIBRARY_ASSETS_DIR,
    LIBRARY_PACKS_DIR,
    PREVIEW_WORKSPACES_DIR,
    PROJECTS_DIR,
    RENDER_WORKSPACES_DIR,
)
from python_api.common.progress import ProgressStore

from .aenv_profile_service_api import get_remotion_setup_status  # noqa: F401


REPO_ROOT = Path(__file__).resolve().parents[4]
REMOTION_ROOT = REPO_ROOT / "remotion"
REMOTION_PUBLIC_ROOT = REMOTION_ROOT / "public"
TEMPLATE_REGISTRY_PATH = REMOTION_ROOT / "config" / "templates.json"
RENDER_SCRIPT = REMOTION_ROOT / "render-workspace.js"

APP_API_BASE_URL = "http://127.0.0.1:6901"
STUDIO_BASE_URL = "http://localhost:3000"
WORKSPACE_TTL_SECONDS = 60 * 60
RENDER_CONCURRENCY = 4
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)%")

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3", ".ogg", ".aac", ".m4a"}
ALLOWED_JSON_SUFFIXES = {".json"}

render_progress_store = ProgressStore()
_render_results: dict[str, dict[str, object]] = {}
_workspace_index: dict[str, dict[str, Any]] = {}
_active_preview_workspace_by_family: dict[str, str] = {}
_state_lock = threading.Lock()


@dataclass(frozen=True)
class UploadedFileData:
    filename: str
    content_type: str | None
    data: bytes


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _now() -> float:
    return time.time()


def _api_url() -> str:
    return APP_API_BASE_URL


def _studio_url(composition_id: str) -> str:
    return f"{STUDIO_BASE_URL}/{composition_id}"


def _resolve_suffix(filename: str, allowed: set[str], fallback: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in allowed else fallback


def _workspace_alias_for_family(family_id: str) -> str:
    return f"preview-active-{family_id.replace('.', '-').replace('_', '-')}"


def _load_registry() -> dict[str, Any]:
    return _read_json(TEMPLATE_REGISTRY_PATH)


def _registry_presets() -> list[dict[str, Any]]:
    return list(_load_registry().get("presets", []))


def _registry_families() -> list[dict[str, Any]]:
    return list(_load_registry().get("families", []))


def _registry_asset_packs() -> list[dict[str, Any]]:
    return list(_load_registry().get("assetPacks", []))


def get_template_catalog(include_internal: bool = False) -> dict[str, Any]:
    registry = _load_registry()
    grouped: dict[str, list[dict[str, Any]]] = {}

    for preset in registry.get("presets", []):
        if not include_internal and preset.get("status") == "internal":
            continue
        category = str(preset.get("category") or "other")
        grouped.setdefault(category, []).append(
            {
                "id": preset["id"],
                "category": category,
                "familyId": preset["familyId"],
                "label": preset["label"],
                "description": preset.get("description", ""),
                "orientation": preset.get("orientation"),
                "aspectRatio": preset.get("aspectRatio"),
                "status": preset.get("status", "active"),
                "defaultAssetPackId": preset.get("defaultAssetPackId"),
                "defaultConfig": preset.get("defaultConfig", {}),
                "featureFlags": preset.get("featureFlags", []),
                "legacyIds": preset.get("legacyIds", []),
            }
        )

    categories = [
        {"category": category, "presets": sorted(items, key=lambda item: item["label"])}
        for category, items in sorted(grouped.items(), key=lambda item: item[0])
    ]
    return {
        "categories": categories,
        "families": registry.get("families", []),
        "assetPacks": registry.get("assetPacks", []),
    }


def get_template_preset(identifier: str) -> dict[str, Any] | None:
    for preset in _registry_presets():
        if preset.get("id") == identifier:
            return preset
        if identifier in preset.get("legacyIds", []):
            return preset
    return None


def get_template_family(family_id: str) -> dict[str, Any] | None:
    for family in _registry_families():
        if family.get("id") == family_id:
            return family
    return None


def get_template_details(identifier: str) -> dict[str, Any]:
    preset = get_template_preset(identifier)
    if not preset:
        raise RuntimeError(f"Unknown template preset '{identifier}'")
    family = get_template_family(str(preset["familyId"]))
    asset_pack = next(
        (pack for pack in _registry_asset_packs() if pack.get("id") == preset.get("defaultAssetPackId")),
        None,
    )
    return {
        "preset": preset,
        "family": family,
        "assetPack": asset_pack,
    }


def _library_asset_dir(asset_id: str) -> Path:
    return LIBRARY_ASSETS_DIR / asset_id


def _project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def _project_file(project_id: str) -> Path:
    return _project_dir(project_id) / "project.json"


def _workspace_root(mode: str, workspace_id: str) -> Path:
    if mode == "preview":
        return PREVIEW_WORKSPACES_DIR / workspace_id
    return RENDER_WORKSPACES_DIR / workspace_id


def _workspace_manifest_path(workspace_id: str) -> Path:
    metadata = _get_workspace_metadata(workspace_id)
    return Path(metadata["path"]) / "workspace.json"


def _workspace_file_url(workspace_id: str, relative_path: str) -> str:
    return f"{_api_url()}/api/v1/workspaces/{workspace_id}/files/{relative_path.replace(chr(92), '/')}"


def _builtin_asset_url(relative_path: str) -> str:
    return f"{_api_url()}/api/v1/remotion/assets/{relative_path}"


def _library_asset_url(asset_id: str) -> str:
    return f"{_api_url()}/api/v1/assets/{asset_id}/file"


def _validate_uploaded_media(upload: UploadedFileData, allowed: set[str], fallback: str, field_name: str) -> str:
    suffix = _resolve_suffix(upload.filename, allowed, fallback)
    if suffix not in allowed:
        raise RuntimeError(f"{field_name}: unsupported file type '{Path(upload.filename).suffix or '<none>'}'")
    if not upload.data:
        raise RuntimeError(f"{field_name} is empty")
    return suffix


def upload_library_asset(upload: UploadedFileData) -> dict[str, Any]:
    suffix = Path(upload.filename).suffix.lower() or ".bin"
    asset_id = _new_id("asset")
    asset_dir = _library_asset_dir(asset_id)
    asset_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"source{suffix}"
    source_path = asset_dir / stored_name
    source_path.write_bytes(upload.data)

    metadata = {
        "assetId": asset_id,
        "originalFilename": upload.filename,
        "contentType": upload.content_type,
        "storedFilename": stored_name,
        "createdAt": _now(),
        "assetRef": f"library://assets/{asset_id}",
    }
    _write_json(asset_dir / "asset.json", metadata)
    return metadata


def list_library_assets() -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    for asset_dir in sorted(LIBRARY_ASSETS_DIR.iterdir(), key=lambda path: path.name):
        metadata_path = asset_dir / "asset.json"
        if metadata_path.exists():
            assets.append(_read_json(metadata_path))
    return assets


def get_library_asset(asset_id: str) -> dict[str, Any]:
    metadata_path = _library_asset_dir(asset_id) / "asset.json"
    if not metadata_path.exists():
        raise RuntimeError(f"Unknown asset '{asset_id}'")
    return _read_json(metadata_path)


def get_library_asset_file(asset_id: str) -> Path:
    metadata = get_library_asset(asset_id)
    file_path = _library_asset_dir(asset_id) / metadata["storedFilename"]
    if not file_path.exists():
        raise RuntimeError(f"Asset file missing for '{asset_id}'")
    return file_path


def save_asset_pack(payload: dict[str, Any]) -> dict[str, Any]:
    pack_id = str(payload.get("id") or _new_id("pack"))
    normalized = {**payload, "id": pack_id, "updatedAt": _now()}
    _write_json(LIBRARY_PACKS_DIR / f"{pack_id}.json", normalized)
    return normalized


def list_asset_packs() -> dict[str, Any]:
    user_packs: list[dict[str, Any]] = []
    for pack_file in sorted(LIBRARY_PACKS_DIR.glob("*.json")):
        user_packs.append(_read_json(pack_file))
    return {
        "builtin": _registry_asset_packs(),
        "user": user_packs,
    }


def create_project(payload: dict[str, Any]) -> dict[str, Any]:
    project_id = str(payload.get("projectId") or _new_id("project"))
    now = _now()
    project = {
        "projectId": project_id,
        "templatePresetId": payload.get("templatePresetId"),
        "title": payload.get("title", ""),
        "content": payload.get("content", {}),
        "slotOverrides": payload.get("slotOverrides", {}),
        "assetPackSelection": payload.get("assetPackSelection"),
        "renderSettings": payload.get("renderSettings", {}),
        "timingOverrides": payload.get("timingOverrides", {}),
        "metadata": payload.get("metadata", {}),
        "createdAt": payload.get("createdAt", now),
        "updatedAt": now,
    }
    _write_json(_project_file(project_id), project)
    return project


def update_project(project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    project = load_project(project_id)
    updated = {
        **project,
        **patch,
        "content": patch.get("content", project.get("content", {})),
        "slotOverrides": patch.get("slotOverrides", project.get("slotOverrides", {})),
        "renderSettings": patch.get("renderSettings", project.get("renderSettings", {})),
        "timingOverrides": patch.get("timingOverrides", project.get("timingOverrides", {})),
        "metadata": patch.get("metadata", project.get("metadata", {})),
        "updatedAt": _now(),
    }
    _write_json(_project_file(project_id), updated)
    return updated


def load_project(project_id: str) -> dict[str, Any]:
    project_path = _project_file(project_id)
    if not project_path.exists():
        raise RuntimeError(f"Unknown project '{project_id}'")
    return _read_json(project_path)


def _resolve_asset_ref(ref: str) -> str:
    if ref.startswith("builtin://"):
        return _builtin_asset_url(ref.removeprefix("builtin://"))
    if ref.startswith("library://assets/"):
        asset_id = ref.removeprefix("library://assets/")
        return _library_asset_url(asset_id)
    if ref.startswith("http://") or ref.startswith("https://"):
        return ref
    raise RuntimeError(f"Unsupported asset reference '{ref}'")


def _workspace_entry(workspace_id: str, *, family_id: str, preset_id: str, mode: str, path: Path) -> dict[str, Any]:
    return {
        "workspaceId": workspace_id,
        "familyId": family_id,
        "presetId": preset_id,
        "mode": mode,
        "path": str(path),
        "createdAt": _now(),
    }


def _register_workspace(metadata: dict[str, Any]) -> None:
    with _state_lock:
        _workspace_index[metadata["workspaceId"]] = metadata


def _get_workspace_metadata(workspace_id: str) -> dict[str, Any]:
    resolved_workspace_id = workspace_id
    with _state_lock:
        if workspace_id in _active_preview_workspace_by_family:
            resolved_workspace_id = _active_preview_workspace_by_family[workspace_id]
        metadata = _workspace_index.get(resolved_workspace_id)
    if not metadata:
        raise RuntimeError(f"Unknown workspace '{workspace_id}'")
    return metadata


def get_workspace_manifest(workspace_id: str) -> dict[str, Any]:
    return _read_json(_workspace_manifest_path(workspace_id))


def get_workspace_file(workspace_id: str, relative_path: str) -> Path:
    metadata = _get_workspace_metadata(workspace_id)
    candidate = (Path(metadata["path"]) / relative_path).resolve()
    workspace_root = Path(metadata["path"]).resolve()
    try:
        candidate.relative_to(workspace_root)
    except ValueError as exc:
        raise RuntimeError("Invalid workspace file path") from exc
    if not candidate.exists():
        raise RuntimeError(f"Workspace file not found: {relative_path}")
    return candidate


def _cleanup_expired_workspaces() -> None:
    cutoff = _now() - WORKSPACE_TTL_SECONDS
    expired: list[str] = []
    with _state_lock:
        for workspace_id, metadata in list(_workspace_index.items()):
            if float(metadata.get("createdAt", 0)) < cutoff:
                expired.append(workspace_id)
        for workspace_id in expired:
            metadata = _workspace_index.pop(workspace_id, None)
            if not metadata:
                continue
            for alias, active_id in list(_active_preview_workspace_by_family.items()):
                if active_id == workspace_id:
                    _active_preview_workspace_by_family.pop(alias, None)
            path = Path(metadata["path"])
            if path.exists():
                shutil.rmtree(path, ignore_errors=True)


def _set_render_result(task_id: str, payload: dict[str, object]) -> None:
    with _state_lock:
        _render_results[task_id] = payload


def get_render_result(task_id: str) -> dict[str, object] | None:
    with _state_lock:
        return _render_results.get(task_id)


def cleanup_remotion_platform_state() -> None:
    _cleanup_expired_workspaces()
    cutoff = _now() - WORKSPACE_TTL_SECONDS
    with _state_lock:
        expired_tasks = [
            task_id
            for task_id, payload in _render_results.items()
            if isinstance(payload.get("created_at"), (int, float)) and float(payload["created_at"]) < cutoff
        ]
        for task_id in expired_tasks:
            _render_results.pop(task_id, None)


def _copy_upload(target_dir: Path, upload: UploadedFileData, *, target_name: str | None = None) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / (target_name or upload.filename)
    target_path.write_bytes(upload.data)
    return target_path


def _resolve_props_asset_refs(obj: Any) -> Any:
    """Recursively resolve builtin:// and library:// asset refs to HTTP URLs."""
    if isinstance(obj, str):
        if obj.startswith(("builtin://", "library://", "http://", "https://")):
            try:
                return _resolve_asset_ref(obj)
            except RuntimeError:
                return obj
        return obj
    if isinstance(obj, dict):
        return {k: _resolve_props_asset_refs(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_props_asset_refs(item) for item in obj]
    return obj


def _news_variant_from_preset(preset: dict[str, Any]) -> tuple[str, bool]:
    variant = str(preset.get("defaultConfig", {}).get("variant", ""))
    if not variant:
        raise RuntimeError(f"Preset '{preset['id']}' is missing 'variant' in defaultConfig")
    return variant, variant == "background"


def _news_intro_slot(preset: dict[str, Any], slot_key: str, override_ref: str | None = None) -> str:
    if override_ref:
        return _resolve_asset_ref(override_ref)
    slot_bindings = preset.get("slotBindings", {})
    ref = slot_bindings.get(slot_key)
    if not ref:
        return ""
    return _resolve_asset_ref(ref)


def _build_news_workspace_from_uploads(
    *,
    preset_id: str,
    mode: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    preset = get_template_preset(preset_id)
    if not preset:
        raise RuntimeError(f"Unknown news preset '{preset_id}'")

    family = get_template_family(str(preset["familyId"]))
    if not family:
        raise RuntimeError(f"Family missing for preset '{preset_id}'")

    workspace_id = _new_id("workspace")
    workspace_root = _workspace_root(mode, workspace_id)
    if workspace_root.exists():
        shutil.rmtree(workspace_root, ignore_errors=True)
    workspace_root.mkdir(parents=True, exist_ok=True)

    audio_suffix = _validate_uploaded_media(audio, ALLOWED_AUDIO_SUFFIXES, ".wav", "audio_file")
    transcript_suffix = _validate_uploaded_media(transcript, ALLOWED_JSON_SUFFIXES, ".json", "transcript_file")
    if not images:
        raise RuntimeError("At least one slideshow image is required")
    if len(images) > 10:
        raise RuntimeError("A maximum of 10 slideshow images is supported")

    audio_path = _copy_upload(workspace_root / "audio", audio, target_name=f"narration{audio_suffix}")
    transcript_path = _copy_upload(workspace_root / "audio", transcript, target_name=f"captions{transcript_suffix}")

    resolved_images: list[str] = []
    for index, image in enumerate(images, start=1):
        image_suffix = _validate_uploaded_media(image, ALLOWED_IMAGE_SUFFIXES, ".png", f"images[{index - 1}]")
        target = _copy_upload(workspace_root / "image", image, target_name=f"{index:02d}{image_suffix}")
        resolved_images.append(_workspace_file_url(workspace_id, str(target.relative_to(workspace_root))))

    hero_overlay_url = ""
    if hero_image:
        hero_suffix = _validate_uploaded_media(hero_image, ALLOWED_IMAGE_SUFFIXES, ".png", "hero_image")
        hero_target = _copy_upload(workspace_root / "image", hero_image, target_name=f"hero-overlay{hero_suffix}")
        hero_overlay_url = _workspace_file_url(workspace_id, str(hero_target.relative_to(workspace_root)))

    captions_payload = json.loads(transcript_path.read_text(encoding="utf-8-sig"))
    variant, is_background_mode = _news_variant_from_preset(preset)
    default_config = preset.get("defaultConfig", {})
    override_intro = (overrides or {}).get("introProps", {})
    intro_duration = int((overrides or {}).get("introDurationInFrames", default_config.get("introDurationInFrames", 150)))
    image_duration = int((overrides or {}).get("imageDurationInFrames", default_config.get("imageDurationInFrames", 170)))
    caption_bottom_percent = float(
        (overrides or {}).get("captionBottomPercent", default_config.get("captionBottomPercent", 20))
    )

    input_props = {
        "variant": variant,
        "orientation": preset.get("orientation", "vertical"),
        "backgroundMode": is_background_mode,
        "introDurationInFrames": intro_duration,
        "imageDurationInFrames": image_duration,
        "captionBottomPercent": caption_bottom_percent,
        "images": resolved_images,
        "videos": [],
        "videoDurations": [],
        "audioSrc": _workspace_file_url(workspace_id, str(audio_path.relative_to(workspace_root))),
        "captions": captions_payload,
        "sections": [],
        "introProps": {
            "image1": _news_intro_slot(preset, "intro.topPanel", override_intro.get("image1"))
            or _news_intro_slot(preset, "intro.leftPanel", override_intro.get("image1")),
            "image2": _news_intro_slot(preset, "intro.bottomPanel", override_intro.get("image2"))
            or _news_intro_slot(preset, "intro.rightPanel", override_intro.get("image2")),
            "heroImage": _news_intro_slot(preset, "intro.hero", override_intro.get("heroImage")),
        },
        "overlayImage": "",
        "backgroundOverlayImage": "",
        "heroOverlayImage": hero_overlay_url or None,
    }

    overlay_override = (overrides or {}).get("overlayImage")
    background_override = (overrides or {}).get("backgroundOverlayImage")
    if variant == "background":
        input_props["backgroundOverlayImage"] = (
            _resolve_asset_ref(background_override)
            if isinstance(background_override, str) and background_override
            else _news_intro_slot(preset, "overlay.background")
        )
    elif variant == "clean":
        input_props["overlayImage"] = (
            _resolve_asset_ref(overlay_override)
            if isinstance(overlay_override, str) and overlay_override
            else _news_intro_slot(preset, "branding.logo")
        )
    elif variant == "cnn":
        input_props["overlayImage"] = (
            _resolve_asset_ref(overlay_override)
            if isinstance(overlay_override, str) and overlay_override
            else _news_intro_slot(preset, "overlay.background")
        )

    manifest = {
        "workspaceId": workspace_id,
        "mode": mode,
        "presetId": preset["id"],
        "familyId": family["id"],
        "compositionId": family["compositionId"],
        "fps": family.get("renderDefaults", {}).get("fps", 30),
        "width": 1920 if preset.get("orientation") == "horizontal" else 1080,
        "height": 1080 if preset.get("orientation") == "horizontal" else 1920,
        "inputProps": input_props,
        "createdAt": _now(),
    }
    _write_json(workspace_root / "workspace.json", manifest)
    _register_workspace(_workspace_entry(workspace_id, family_id=family["id"], preset_id=preset["id"], mode=mode, path=workspace_root))
    return manifest


def create_project_preview(project_id: str) -> dict[str, Any]:
    project = load_project(project_id)
    preset_id = str(project.get("templatePresetId") or "")
    preset = get_template_preset(preset_id)
    if not preset:
        raise RuntimeError(f"Unknown preset '{preset_id}'")

    family = get_template_family(str(preset["familyId"]))
    if not family:
        raise RuntimeError(f"Family missing for preset '{preset_id}'")

    workspace_id = _new_id("workspace")
    workspace_root = _workspace_root("preview", workspace_id)
    workspace_root.mkdir(parents=True, exist_ok=True)

    # Start from preset defaults, overlay project-specific content, then resolve all asset refs.
    raw_props: dict[str, Any] = {
        **preset.get("defaultConfig", {}),
        "orientation": preset.get("orientation", "vertical"),
        **project.get("content", {}),
        **project.get("timingOverrides", {}),
        **project.get("renderSettings", {}),
    }
    input_props = _resolve_props_asset_refs(raw_props)

    manifest = {
        "workspaceId": workspace_id,
        "mode": "preview",
        "presetId": preset["id"],
        "familyId": family["id"],
        "compositionId": family["compositionId"],
        "fps": family.get("renderDefaults", {}).get("fps", 30),
        "width": 1920 if preset.get("orientation") == "horizontal" else 1080,
        "height": 1080 if preset.get("orientation") == "horizontal" else 1920,
        "inputProps": input_props,
        "createdAt": _now(),
    }
    _write_json(workspace_root / "workspace.json", manifest)
    _register_workspace(_workspace_entry(workspace_id, family_id=family["id"], preset_id=preset["id"], mode="preview", path=workspace_root))
    alias = _workspace_alias_for_family(str(family["id"]))
    with _state_lock:
        _active_preview_workspace_by_family[alias] = workspace_id
    return {
        "workspaceId": workspace_id,
        "familyId": family["id"],
        "studioUrl": _studio_url(str(family["compositionId"])),
        "manifest": manifest,
    }


def _run_render_subprocess(
    *,
    task_id: str,
    job_store: JobStore,
    workspace_manifest: dict[str, Any],
) -> None:
    """Execute a remotion render for the given workspace manifest, update progress, and clean up."""
    output_path = EXPORTS_DIR / f"{task_id}.mp4"
    if output_path.exists():
        output_path.unlink()

    cmd = [
        "node", "render-workspace.js",
        "--composition", str(workspace_manifest["compositionId"]),
        "--workspace", str(workspace_manifest["workspaceId"]),
        "--output", str(output_path),
        "--concurrency", str(RENDER_CONCURRENCY),
        "--api-base", _api_url(),
    ]

    render_progress_store.set_progress(task_id, "processing", 10, "Rendering video...")
    process = subprocess.Popen(
        cmd,
        cwd=str(REMOTION_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if process.stdout is None:
        raise RuntimeError("Failed to capture render output")

    for raw_line in process.stdout:
        line = raw_line.strip()
        if not line:
            continue
        render_progress_store.add_log(task_id, line)
        match = _PERCENT_RE.search(line)
        if match:
            pct = float(match.group(1))
            mapped = 10 + int(max(0.0, min(100.0, pct)) * 0.85)
            render_progress_store.set_progress(task_id, "processing", min(mapped, 95), "Rendering video...")

    rc = process.wait()
    if rc != 0:
        raise RuntimeError(f"Remotion render failed with exit code {rc}")
    if not output_path.exists():
        raise RuntimeError("Rendered video file was not produced")

    stored_file = job_store.add_file(output_path, output_path.name)
    download_url = f"/api/v1/files/{stored_file.file_id}"
    _set_render_result(
        task_id,
        {
            "created_at": _now(),
            "video": {"filename": stored_file.filename, "download_url": download_url},
            "preview_url": download_url,
            "workspace_id": workspace_manifest["workspaceId"],
        },
    )
    render_progress_store.set_progress(task_id, "complete", 100, "Video render complete.")


def _check_render_prerequisites() -> None:
    if not RENDER_SCRIPT.exists():
        raise RuntimeError("render-workspace.js not found in remotion directory")
    if not (REMOTION_ROOT / "node_modules" / "@remotion").exists():
        raise RuntimeError(
            "Remotion npm dependencies not installed. Please go to Settings -> Remotion Setup and click 'npm install'."
        )


def start_project_render(*, job_store: JobStore, project_id: str) -> str:
    project = load_project(project_id)
    preset_id = str(project.get("templatePresetId") or "")
    preset = get_template_preset(preset_id)
    if not preset:
        raise RuntimeError(f"Unknown preset '{preset_id}'")

    family = get_template_family(str(preset["familyId"]))
    if not family:
        raise RuntimeError(f"Family missing for preset '{preset_id}'")

    _check_render_prerequisites()

    task_id = _new_id("render")
    render_progress_store.set_progress(task_id, "starting", 0, "Starting render workspace...")

    def _runner() -> None:
        workspace_manifest: dict[str, Any] | None = None
        try:
            workspace_id = _new_id("workspace")
            workspace_root = _workspace_root("render", workspace_id)
            workspace_root.mkdir(parents=True, exist_ok=True)

            raw_props: dict[str, Any] = {
                **preset.get("defaultConfig", {}),
                "orientation": preset.get("orientation", "vertical"),
                **project.get("content", {}),
                **project.get("timingOverrides", {}),
                **project.get("renderSettings", {}),
            }
            input_props = _resolve_props_asset_refs(raw_props)

            workspace_manifest = {
                "workspaceId": workspace_id,
                "mode": "render",
                "presetId": preset["id"],
                "familyId": family["id"],
                "compositionId": family["compositionId"],
                "fps": family.get("renderDefaults", {}).get("fps", 30),
                "width": 1920 if preset.get("orientation") == "horizontal" else 1080,
                "height": 1080 if preset.get("orientation") == "horizontal" else 1920,
                "inputProps": input_props,
                "createdAt": _now(),
            }
            _write_json(workspace_root / "workspace.json", workspace_manifest)
            _register_workspace(
                _workspace_entry(workspace_id, family_id=family["id"], preset_id=preset["id"], mode="render", path=workspace_root)
            )

            _run_render_subprocess(task_id=task_id, job_store=job_store, workspace_manifest=workspace_manifest)
        except Exception as exc:
            render_progress_store.add_log(task_id, f"[ERROR] {exc}")
            render_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Remotion platform render failed: {exc}", "error", log_name="app-service.log")
        finally:
            if workspace_manifest:
                workspace_root = _workspace_root("render", str(workspace_manifest["workspaceId"]))
                if workspace_root.exists():
                    shutil.rmtree(workspace_root, ignore_errors=True)
                with _state_lock:
                    _workspace_index.pop(str(workspace_manifest["workspaceId"]), None)

    threading.Thread(target=_runner, daemon=True).start()
    return task_id


def stage_news_preview(
    *,
    preset_identifier: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    preset = get_template_preset(preset_identifier)
    if not preset:
        raise RuntimeError(f"Unknown preset '{preset_identifier}'")
    manifest = _build_news_workspace_from_uploads(
        preset_id=str(preset["id"]),
        mode="preview",
        audio=audio,
        transcript=transcript,
        images=images,
        hero_image=hero_image,
        overrides=overrides,
    )
    alias = _workspace_alias_for_family(str(manifest["familyId"]))
    with _state_lock:
        _active_preview_workspace_by_family[alias] = manifest["workspaceId"]
    return {
        "workspace_id": manifest["workspaceId"],
        "family_id": manifest["familyId"],
        "preset_id": manifest["presetId"],
        "studio_url": _studio_url(str(manifest["compositionId"])),
    }


def start_news_render(
    *,
    job_store: JobStore,
    preset_identifier: str,
    audio: UploadedFileData,
    transcript: UploadedFileData,
    images: list[UploadedFileData],
    hero_image: UploadedFileData | None,
    overrides: dict[str, Any] | None = None,
) -> str:
    preset = get_template_preset(preset_identifier)
    if not preset:
        raise RuntimeError(f"Unknown preset '{preset_identifier}'")
    if not get_template_family(str(preset["familyId"])):
        raise RuntimeError(f"Family missing for preset '{preset_identifier}'")

    _check_render_prerequisites()

    task_id = _new_id("render")
    render_progress_store.set_progress(task_id, "starting", 0, "Starting render workspace...")

    def _runner() -> None:
        workspace_manifest: dict[str, Any] | None = None
        try:
            workspace_manifest = _build_news_workspace_from_uploads(
                preset_id=str(preset["id"]),
                mode="render",
                audio=audio,
                transcript=transcript,
                images=images,
                hero_image=hero_image,
                overrides=overrides,
            )
            _run_render_subprocess(task_id=task_id, job_store=job_store, workspace_manifest=workspace_manifest)
        except Exception as exc:
            render_progress_store.add_log(task_id, f"[ERROR] {exc}")
            render_progress_store.set_progress(task_id, "error", 0, str(exc))
            log(f"Remotion platform render failed: {exc}", "error", log_name="app-service.log")
        finally:
            if workspace_manifest:
                workspace_root = _workspace_root("render", str(workspace_manifest["workspaceId"]))
                if workspace_root.exists():
                    shutil.rmtree(workspace_root, ignore_errors=True)
                with _state_lock:
                    _workspace_index.pop(str(workspace_manifest["workspaceId"]), None)

    threading.Thread(target=_runner, daemon=True).start()
    return task_id


def resolve_builtin_asset_path(relative_path: str) -> Path:
    candidate = (REMOTION_PUBLIC_ROOT / relative_path).resolve()
    try:
        candidate.relative_to(REMOTION_PUBLIC_ROOT.resolve())
    except ValueError as exc:
        raise RuntimeError("Invalid built-in asset path") from exc
    if not candidate.exists():
        raise RuntimeError(f"Built-in asset not found: {relative_path}")
    return candidate
