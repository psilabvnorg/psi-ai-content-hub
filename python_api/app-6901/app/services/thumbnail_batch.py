from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

import json as _json

import requests

from python_api.common.jobs import JobStore
from python_api.common.progress import ProgressStore


a_thumbnail_batch_progress_store_data = ProgressStore()
a_thumbnail_bridge_base_url_text_data = os.environ.get("THUMBNAIL_BRIDGE_URL", "http://127.0.0.1:6915")


def a_call_thumbnail_bridge_render_batch_data(
    a_template_data: dict[str, Any],
    a_row_list_data: list[dict[str, Any]],
    a_label_column_text_data: str,
) -> dict[str, Any]:
    a_bridge_url_text_data = f"{a_thumbnail_bridge_base_url_text_data}/thumbnail/render-batch"
    a_response_data = requests.post(
        a_bridge_url_text_data,
        data=_json.dumps(
            {"template": a_template_data, "rows": a_row_list_data, "label_column": a_label_column_text_data},
            ensure_ascii=False,
        ).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        timeout=600,
    )
    if a_response_data.status_code >= 400:
        try:
            a_error_payload_data = a_response_data.json()
            a_error_text_data = str(a_error_payload_data.get("error") or a_error_payload_data)
        except Exception:
            a_error_text_data = a_response_data.text or f"Bridge returned HTTP {a_response_data.status_code}"
        raise RuntimeError(f"Thumbnail bridge render failed: {a_error_text_data}")
    return a_response_data.json()


def a_register_bridge_file_to_job_store_data(
    a_job_store_data: JobStore,
    a_bridge_file_payload_data: dict[str, Any],
    a_default_file_name_text_data: str,
) -> dict[str, Any]:
    a_path_text_data = str(a_bridge_file_payload_data.get("path") or "").strip()
    a_file_name_text_data = str(a_bridge_file_payload_data.get("filename") or a_default_file_name_text_data).strip()
    if not a_path_text_data:
        raise RuntimeError("Bridge result missing file path")
    a_path_data = Path(a_path_text_data)
    if not a_path_data.exists():
        raise RuntimeError(f"Bridge output file does not exist: {a_path_text_data}")
    a_file_record_data = a_job_store_data.add_file(a_path_data, a_file_name_text_data or a_path_data.name)
    return {
        "filename": a_file_name_text_data or a_path_data.name,
        "download_url": f"/api/v1/files/{a_file_record_data.file_id}",
    }


def a_run_thumbnail_batch_worker_data(
    a_job_store_data: JobStore,
    a_job_id_text_data: str,
    a_template_data: dict[str, Any],
    a_row_list_data: list[dict[str, Any]],
    a_label_column_text_data: str,
) -> None:
    try:
        a_thumbnail_batch_progress_store_data.set_progress(a_job_id_text_data, "processing", 10, "Sending request to Electron bridge")
        a_bridge_result_data = a_call_thumbnail_bridge_render_batch_data(
            a_template_data,
            a_row_list_data,
            a_label_column_text_data,
        )
        a_thumbnail_batch_progress_store_data.set_progress(a_job_id_text_data, "processing", 85, "Registering output files")

        a_sample_payload_data = a_bridge_result_data.get("sample") or {}
        a_archive_payload_data = a_bridge_result_data.get("archive") or {}
        a_sample_result_data = a_register_bridge_file_to_job_store_data(
            a_job_store_data,
            a_sample_payload_data,
            "thumbnail_sample.png",
        )
        a_archive_result_data = a_register_bridge_file_to_job_store_data(
            a_job_store_data,
            a_archive_payload_data,
            "thumbnails.zip",
        )

        a_result_payload_data = {
            "total_rows": int(a_bridge_result_data.get("total_rows") or len(a_row_list_data)),
            "success_rows": int(a_bridge_result_data.get("success_rows") or 0),
            "failed_rows": int(a_bridge_result_data.get("failed_rows") or 0),
            "sample": {
                "row_index": a_sample_payload_data.get("row_index"),
                "label": a_sample_payload_data.get("label"),
                **a_sample_result_data,
            },
            "archive": a_archive_result_data,
            "failures": a_bridge_result_data.get("failures") or [],
        }
        a_job_store_data.update_job(a_job_id_text_data, "complete", result=a_result_payload_data)
        a_thumbnail_batch_progress_store_data.set_progress(a_job_id_text_data, "complete", 100, "Thumbnail batch complete")
    except Exception as a_error_data:
        a_job_store_data.update_job(a_job_id_text_data, "error", error=str(a_error_data))
        a_thumbnail_batch_progress_store_data.set_progress(a_job_id_text_data, "error", 0, str(a_error_data))


def a_start_thumbnail_batch_job_data(
    a_job_store_data: JobStore,
    a_template_data: dict[str, Any],
    a_row_list_data: list[dict[str, Any]],
    a_label_column_text_data: str | None,
) -> str:
    a_job_record_data = a_job_store_data.create_job()
    a_effective_label_column_text_data = str(a_label_column_text_data or "").strip()
    if not a_effective_label_column_text_data and a_row_list_data:
        a_effective_label_column_text_data = str(next(iter(a_row_list_data[0].keys()), ""))
    if not a_effective_label_column_text_data:
        a_effective_label_column_text_data = "label"

    a_thumbnail_batch_progress_store_data.set_progress(a_job_record_data.job_id, "queued", 0, "Queued")
    threading.Thread(
        target=a_run_thumbnail_batch_worker_data,
        args=(
            a_job_store_data,
            a_job_record_data.job_id,
            a_template_data,
            a_row_list_data,
            a_effective_label_column_text_data,
        ),
        daemon=True,
    ).start()
    return a_job_record_data.job_id


def a_get_thumbnail_batch_status_data(a_job_store_data: JobStore, a_job_id_text_data: str) -> dict[str, Any] | None:
    a_job_record_data = a_job_store_data.get_job(a_job_id_text_data)
    if not a_job_record_data:
        return None
    a_progress_payload_data = a_thumbnail_batch_progress_store_data.get_payload(a_job_id_text_data, include_logs=False)
    return {
        "job_id": a_job_record_data.job_id,
        "status": a_job_record_data.status,
        "result": a_job_record_data.result,
        "error": a_job_record_data.error,
        "progress": a_progress_payload_data,
    }

