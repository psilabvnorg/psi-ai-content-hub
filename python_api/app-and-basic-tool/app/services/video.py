from __future__ import annotations

import re
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional

from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR
from python_api.common.progress import ProgressStore
from python_api.common.jobs import JobStore
from .tools_manager import aget_ffmpeg_bin_path_data, aget_yt_dlp_bin_path_data


_PROGRESS_RE = re.compile(r"(\d+\.?\d*)%")
progress_store = ProgressStore()


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

            # Resolve full paths to external tools
            # (when launched from Electron, venv isn't activated so bare names won't resolve)
            yt_dlp_bin = aget_yt_dlp_bin_path_data()
            if not yt_dlp_bin:
                # Fallback: check venv Scripts dir
                venv_scripts = Path(sys.executable).parent
                yt_dlp_bin = venv_scripts / ("yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
            ytdlp_args = [
                str(yt_dlp_bin),
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

            # Resolve ffmpeg/ffprobe paths from tools_manager
            ffmpeg_bin = aget_ffmpeg_bin_path_data()
            ffprobe_bin = None
            if ffmpeg_bin:
                ffprobe_name = "ffprobe.exe" if sys.platform == "win32" else "ffprobe"
                ffprobe_bin = ffmpeg_bin.parent / ffprobe_name

            video_codec = "unknown"
            try:
                probe = subprocess.check_output(
                    [
                        str(ffprobe_bin) if ffprobe_bin else "ffprobe",
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
                        str(ffmpeg_bin) if ffmpeg_bin else "ffmpeg",
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
                "download_url": f"/api/v1/files/{file_record.file_id}",
                "platform": platform,
                "codec": "h264" if converted else video_codec,
                "original_codec": video_codec,
                "converted": converted,
            }
            job_store.update_job(job.job_id, "complete", result=result)
            progress_store.set_progress(job.job_id, "complete", 100, "Download complete")
            progress_store.add_log(job.job_id, result["download_url"])
        except Exception as exc:
            job_store.update_job(job.job_id, "error", error=str(exc))
            progress_store.set_progress(job.job_id, "error", 0, str(exc))
            log(f"Video download failed: {exc}", "error", log_name="app-service.log")

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
