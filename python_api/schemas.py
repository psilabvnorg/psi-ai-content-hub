from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    status: str


class DownloadVideoRequest(BaseModel):
    url: str
    platform: Literal["youtube", "tiktok", "facebook", "instagram"]
    convert_to_h264: bool = False


class JobIdResponse(BaseModel):
    job_id: str


class ToolFileResponse(BaseModel):
    status: str = "success"
    filename: str
    download_url: str
    message: Optional[str] = None


class VideoTrimRequest(BaseModel):
    start_time: str
    end_time: Optional[str] = None


class VideoSpeedRequest(BaseModel):
    speed: float = Field(..., ge=0.5, le=2.0)


class AudioNormalizeRequest(BaseModel):
    target_lufs: Optional[float] = None


class AudioCompressRequest(BaseModel):
    bitrate: Optional[str] = None
