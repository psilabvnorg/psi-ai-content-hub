from __future__ import annotations

import re
import subprocess
import threading
from pathlib import Path
from typing import Optional

from ..logging import log
from ..psi_server_utils import ProgressStore
from ..settings import TEMP_DIR
from .jobs import JobStore


_PROGRESS_RE = re.compile(r"(\d+\.?\d*)%")
progress_store = ProgressStore()


def _temp_path(prefix: str, ext: str) -> Path:
    return TEMP_DIR / f"{prefix}_{int(threading.get_ident())}_{int(Path().stat().st_mtime_ns if Path().exists() else 0)}.{ext}"


def _generate_output(prefix: str, ext: str) -> Path:
    return TEMP_DIR / f"{prefix}_{int(threading.get_ident())}_{int(threading.get_native_id())}.{ext}"


def start_download(
    job_store: JobStore,
    url: str,
    platform: str,
    convert_to_h264: bool = False,
) -> str:
    job = job_store.create_job()

    def runner() -> None:
        temp_download = TEMP_DIR / f"{platform}_temp_{job.job_id}.mp4"
        output_file = TEMP_DIR / f"{platform}_video_{job.job_id}.mp4"
        try:
            progress_store.set_progress(job.job_id, "starting", 0, "Starting download...")
            ytdlp_args = [
                "yt-dlp",
                "-f",
                "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "-o",
                str(temp_download),
                "--merge-output-format",
                "mp4",
                "--no-warnings",
                "--progress",
                "--newline",
                url,
            ]

            proc = subprocess.Popen(
                ytdlp_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            if proc.stdout:
                for line in proc.stdout:
                    match = _PROGRESS_RE.search(line)
                    if match:
                        percent = int(float(match.group(1)))
                        progress_store.set_progress(job.job_id, "downloading", percent, f"Downloading {percent}%")
            code = proc.wait()
            if code != 0:
                raise RuntimeError(f"yt-dlp exited with code {code}")

            progress_store.set_progress(job.job_id, "processing", 90, "Checking codec...")
            video_codec = "unknown"
            try:
                probe = subprocess.check_output(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "stream=codec_name",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(temp_download),
                    ],
                    text=True,
                )
                video_codec = probe.strip()
            except Exception:
                pass

            converted = False
            if convert_to_h264 and video_codec != "h264":
                progress_store.set_progress(job.job_id, "converting", 95, "Converting to H.264...")
                subprocess.check_call(
                    [
                        "ffmpeg",
                        "-i",
                        str(temp_download),
                        "-c:v",
                        "libx264",
                        "-crf",
                        "18",
                        "-preset",
                        "medium",
                        "-c:a",
                        "copy",
                        "-movflags",
                        "+faststart",
                        "-y",
                        str(output_file),
                    ]
                )
                converted = True
                temp_download.unlink(missing_ok=True)
            else:
                temp_download.replace(output_file)

            file_record = job_store.add_file(output_file, output_file.name)
            result = {
                "status": "complete",
                "filename": output_file.name,
                "download_url": f"/api/download/{file_record.file_id}",
                "platform": platform,
                "codec": "h264" if converted else video_codec,
                "original_codec": video_codec,
                "converted": converted,
            }
            job_store.update_job(job.job_id, "complete", result=result)
            progress_store.set_progress(job.job_id, "complete", 100, "Download complete")
        except Exception as exc:
            job_store.update_job(job.job_id, "error", error=str(exc))
            progress_store.set_progress(job.job_id, "error", 0, str(exc))
            log(f"Video download failed: {exc}", "error")

    threading.Thread(target=runner, daemon=True).start()
    return job.job_id


def get_download_status(job_store: JobStore, job_id: str) -> Optional[dict]:
    record = job_store.get_job(job_id)
    if not record:
        return None
    payload = {
        "job_id": record.job_id,
        "status": record.status,
        "result": record.result,
        "error": record.error,
    }
    return payload
