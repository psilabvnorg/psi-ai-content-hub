from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

from python_api.common.paths import TEMP_DIR
from .tools_manager import aget_ffmpeg_bin_path_data


UPSCAYL_MODELS = [
    "ultrasharp-4x",
    "remacri-4x",
    "ultramix-balanced-4x",
    "high-fidelity-4x",
    "digital-art-4x",
    "upscayl-standard-4x",
    "upscayl-lite-4x",
]

_UPSCAYL_DIR = Path(__file__).resolve().parent / "upscale_image" / "resources"
_UPSCAYL_BIN = _UPSCAYL_DIR / "win" / "bin" / "upscayl-bin.exe"
_UPSCAYL_MODELS_DIR = _UPSCAYL_DIR / "models"


def get_ffmpeg_cmd() -> str:
    """Return full path to ffmpeg binary, falling back to bare name."""
    ffmpeg_bin = aget_ffmpeg_bin_path_data()
    return str(ffmpeg_bin) if ffmpeg_bin else "ffmpeg"


def save_upload(filename: str, content: bytes) -> Path:
    """Write upload bytes to a temp file and return its path.

    Raises:
        ValueError: if filename is empty.
    """
    if not filename:
        raise ValueError("filename is required")
    suffix = Path(filename).suffix or ".bin"
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    target = TEMP_DIR / f"upload_{os.getpid()}_{filename}{suffix if not filename.endswith(suffix) else ''}"
    with target.open("wb") as handle:
        handle.write(content)
    return target


def trim_video(input_path: Path, start_time: str, end_time: Optional[str] = None) -> Path:
    """Trim a video file between start_time and optional end_time.

    Returns the output path.
    """
    output_path = input_path.with_suffix(".trimmed.mp4")
    cmd = [get_ffmpeg_cmd(), "-i", str(input_path), "-ss", start_time]
    if end_time:
        cmd.extend(["-to", end_time])
    cmd.extend(["-c", "copy", "-y", str(output_path)])
    subprocess.check_call(cmd)
    return output_path


def extract_audio(input_path: Path, format: str) -> Path:
    """Extract audio track from a video file.

    Args:
        format: 'mp3' or 'wav'.

    Raises:
        ValueError: if format is unsupported.
    """
    if format not in ("mp3", "wav"):
        raise ValueError("format must be mp3 or wav")
    output_path = input_path.with_suffix(f".{format}")
    codec = "libmp3lame" if format == "mp3" else "pcm_s16le"
    subprocess.check_call(
        [get_ffmpeg_cmd(), "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)]
    )
    return output_path


def extract_audio_from_path(input_path: Path, format: str, output_suffix: str = ".audio") -> Path:
    """Extract audio from a video at a given path using a custom output suffix.

    Args:
        output_suffix: suffix inserted before the format extension, e.g. '.audio'.

    Raises:
        ValueError: if format is unsupported.
        FileNotFoundError: if input_path does not exist.
    """
    if format not in ("mp3", "wav"):
        raise ValueError("format must be mp3 or wav")
    if not input_path.exists():
        raise FileNotFoundError(f"File no longer exists on disk: {input_path}")
    output_path = input_path.with_suffix(f"{output_suffix}.{format}")
    codec = "libmp3lame" if format == "mp3" else "pcm_s16le"
    subprocess.check_call(
        [get_ffmpeg_cmd(), "-i", str(input_path), "-vn", "-acodec", codec, "-ar", "44100", "-ac", "2", "-y", str(output_path)]
    )
    return output_path


def convert_audio(input_path: Path, output_format: str) -> Path:
    """Convert an audio file to mp3 or wav.

    Raises:
        ValueError: if output_format is unsupported.
    """
    if output_format not in ("mp3", "wav"):
        raise ValueError("output_format must be mp3 or wav")
    output_path = input_path.with_suffix(f".{output_format}")
    codec = "libmp3lame" if output_format == "mp3" else "pcm_s16le"
    subprocess.check_call([get_ffmpeg_cmd(), "-i", str(input_path), "-acodec", codec, "-y", str(output_path)])
    return output_path


def trim_audio(
    input_path: Path,
    start_time: str,
    end_time: Optional[str] = None,
    output_format: str = "mp3",
) -> Path:
    """Trim an audio file between start_time and optional end_time.

    Raises:
        ValueError: if output_format is unsupported.
    """
    if output_format not in ("mp3", "wav"):
        raise ValueError("output_format must be mp3 or wav")
    output_path = input_path.with_suffix(f".trimmed.{output_format}")
    codec = "libmp3lame" if output_format == "mp3" else "pcm_s16le"
    cmd = [get_ffmpeg_cmd(), "-i", str(input_path), "-ss", start_time]
    if end_time:
        cmd.extend(["-to", end_time])
    cmd.extend(["-acodec", codec, "-vn", "-y", str(output_path)])
    subprocess.check_call(cmd)
    return output_path


def adjust_video_speed(input_path: Path, speed: float) -> Path:
    """Change the playback speed of a video.

    Raises:
        ValueError: if speed is outside [0.5, 2.0].
    """
    if speed < 0.5 or speed > 2.0:
        raise ValueError("speed must be between 0.5 and 2.0")
    output_path = input_path.with_suffix(".speed.mp4")
    pts_multiplier = 1.0 / speed
    subprocess.check_call(
        [
            get_ffmpeg_cmd(),
            "-i", str(input_path),
            "-filter:v", f"setpts={pts_multiplier}*PTS",
            "-filter:a", f"atempo={speed}",
            "-y", str(output_path),
        ]
    )
    return output_path


def get_upscayl_models() -> list[str]:
    """Return the list of supported Upscayl model names."""
    return UPSCAYL_MODELS


def is_upscayl_binary_found() -> bool:
    """Return True if the Upscayl binary exists."""
    return _UPSCAYL_BIN.exists()


def upscale_image(input_path: Path, model_name: str, scale: int) -> Path:
    """Upscale an image using Upscayl.

    Raises:
        ValueError: if scale or model_name is invalid.
        RuntimeError: if the binary is missing or upscaling fails.
        FileNotFoundError: if output file was not produced.
    """
    if scale not in (2, 3, 4):
        raise ValueError("scale must be 2, 3, or 4")
    if model_name not in UPSCAYL_MODELS:
        raise ValueError(f"Unknown model. Choose from: {', '.join(UPSCAYL_MODELS)}")
    if not _UPSCAYL_BIN.exists():
        raise RuntimeError("upscayl-bin not found. Check installation.")
    output_path = input_path.with_suffix(f".upscaled_{scale}x.png")
    cmd = [
        str(_UPSCAYL_BIN),
        "-i", str(input_path),
        "-o", str(output_path),
        "-m", str(_UPSCAYL_MODELS_DIR),
        "-n", model_name,
        "-s", str(scale),
        "-f", "png",
        "-c", "0",
    ]
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Upscaling failed (exit code {exc.returncode})") from exc
    if not output_path.exists():
        raise FileNotFoundError("Upscaling produced no output file")
    return output_path
