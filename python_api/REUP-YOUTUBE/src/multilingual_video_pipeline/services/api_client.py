"""Shared HTTP client for pipeline API integrations."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from ..config import get_settings
from ..logging_config import LoggerMixin


class ApiClientError(Exception):
    """Raised when an API interaction fails."""


class ApiClient(LoggerMixin):
    """HTTP client with retries, SSE polling, and file downloads."""

    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.timeout = int(getattr(self.settings, "api_timeout", 600))

        retries = Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(["GET", "POST"]),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session = requests.Session()
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def post_json(self, base_url: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST JSON body and return JSON object response."""
        url = self._to_url(base_url, path)
        response = self.session.post(url, json=payload, timeout=self.timeout)
        response.raise_for_status()
        return self._json_object(response)

    def get_json(self, base_url: str, path: str) -> Dict[str, Any]:
        """GET JSON payload from path."""
        url = self._to_url(base_url, path)
        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return self._json_object(response)

    def post_multipart(
        self,
        base_url: str,
        path: str,
        data: Optional[Dict[str, str]] = None,
        files: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """POST multipart body and return JSON object response."""
        url = self._to_url(base_url, path)
        response = self.session.post(url, data=data or {}, files=files or {}, timeout=self.timeout)
        response.raise_for_status()
        return self._json_object(response)

    def stream_sse(
        self,
        base_url: str,
        path: str,
        method: str = "GET",
        json_payload: Optional[Dict[str, Any]] = None,
        stage_name: Optional[str] = None,
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Consume an SSE endpoint (GET or POST) and return final event payload."""
        url = self._to_url(base_url, path)
        request_kwargs: Dict[str, Any] = {"stream": True, "timeout": self.timeout}
        if json_payload is not None:
            request_kwargs["json"] = json_payload

        response = self.session.request(method=method.upper(), url=url, **request_kwargs)
        response.raise_for_status()

        final_payload: Optional[Dict[str, Any]] = None
        for raw_line in response.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue

            payload_str = line[len("data:") :].strip()
            if not payload_str:
                continue

            try:
                payload = json.loads(payload_str)
            except json.JSONDecodeError:
                continue

            if not isinstance(payload, dict):
                continue

            self._emit_progress(payload, stage_name=stage_name, progress_callback=progress_callback)

            status = str(payload.get("status", "")).lower()
            if status in {"complete", "completed", "error", "failed"}:
                final_payload = payload
                break

        if final_payload is None:
            raise ApiClientError(f"SSE stream ended unexpectedly: {url}")

        status = str(final_payload.get("status", "")).lower()
        if status in {"error", "failed"}:
            message = str(final_payload.get("message") or "Unknown API error")
            raise ApiClientError(message)

        return final_payload

    def poll_for_completion(
        self,
        base_url: str,
        task_id: str,
        stream_path: str,
        result_path: str,
        stage_name: Optional[str] = None,
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Poll task completion by SSE stream, then fetch final result JSON."""
        self.stream_sse(
            base_url=base_url,
            path=f"{stream_path.rstrip('/')}/{task_id}",
            method="GET",
            stage_name=stage_name,
            progress_callback=progress_callback,
        )
        return self.get_json(base_url, f"{result_path.rstrip('/')}/{task_id}")

    def download_file(self, base_url: str, file_id: str, output_path: Path) -> Path:
        """Download a file by file id to a local path."""
        return self.download_from_url(base_url, f"/api/v1/files/{file_id}", output_path)

    def download_from_url(self, base_url: str, download_url: str, output_path: Path) -> Path:
        """Download file from absolute/relative URL to output path."""
        url = self._to_url(base_url, download_url)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()
        output_path.write_bytes(response.content)
        return output_path

    @staticmethod
    def extract_file_id(download_url: str) -> Optional[str]:
        """Extract file id from `/api/v1/files/{file_id}` URL."""
        match = re.search(r"/api/v1/files/([^/?#]+)", download_url)
        if not match:
            return None
        return match.group(1)

    def _to_url(self, base_url: str, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        if path_or_url.startswith("/"):
            return f"{base_url}{path_or_url}"
        return f"{base_url}/{path_or_url}"

    @staticmethod
    def _json_object(response: requests.Response) -> Dict[str, Any]:
        payload = response.json()
        if not isinstance(payload, dict):
            raise ApiClientError("Expected JSON object response")
        return payload

    @staticmethod
    def _emit_progress(
        payload: Dict[str, Any],
        stage_name: Optional[str],
        progress_callback: Optional[Any],
    ) -> None:
        if progress_callback is None or not stage_name:
            return
        if not hasattr(progress_callback, "on_stage_progress"):
            return

        raw_percent = payload.get("percent", 0)
        if isinstance(raw_percent, (int, float)):
            percent = max(0, min(100, int(raw_percent)))
        else:
            percent = 0

        message = payload.get("message")
        status_msg = message if isinstance(message, str) else ""
        progress_callback.on_stage_progress(stage_name, percent, 100, status_msg)
