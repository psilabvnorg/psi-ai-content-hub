from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from .jobs import JobStore


def convert_audio(job_store: JobStore, input_path: Path, output_format: str) -> dict:
    output_path = input_path.with_suffix(f".{output_format}")
    codec = "libmp3lame" if output_format == "mp3" else "pcm_s16le"
    subprocess.check_call(["ffmpeg", "-i", str(input_path), "-acodec", codec, "-y", str(output_path)])
    file_record = job_store.add_file(output_path, output_path.name)
    return {
        "status": "success",
        "filename": output_path.name,
        "download_url": f"/api/download/{file_record.file_id}",
    }


def normalize_audio(job_store: JobStore, input_path: Path, target_lufs: Optional[float]) -> dict:
    output_path = input_path.with_suffix(".normalized" + input_path.suffix)
    if target_lufs is None:
        target_lufs = -14.0
    filter_arg = f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11"
    subprocess.check_call(["ffmpeg", "-i", str(input_path), "-af", filter_arg, "-y", str(output_path)])
    file_record = job_store.add_file(output_path, output_path.name)
    return {
        "status": "success",
        "filename": output_path.name,
        "download_url": f"/api/download/{file_record.file_id}",
    }


def compress_audio(job_store: JobStore, input_path: Path, bitrate: Optional[str]) -> dict:
    output_path = input_path.with_suffix(".compressed" + input_path.suffix)
    target_bitrate = bitrate or "192k"
    subprocess.check_call(["ffmpeg", "-i", str(input_path), "-b:a", target_bitrate, "-y", str(output_path)])
    file_record = job_store.add_file(output_path, output_path.name)
    return {
        "status": "success",
        "filename": output_path.name,
        "download_url": f"/api/download/{file_record.file_id}",
    }
