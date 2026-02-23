from __future__ import annotations

import subprocess
import threading
import time
import uuid
from typing import Any, Optional

import httpx

from python_api.common.jobs import JobStore
from python_api.common.logging import log
from python_api.common.paths import TEMP_DIR
from python_api.common.progress import ProgressStore
from ..services.tools_manager import aget_ffmpeg_bin_path_data
from ..services.video import start_download, progress_store as video_progress_store
from ..whisper.services import stt as stt_service
from ..translation.services.translation import (
    start_translation,
    translation_progress,
)
from ..image_search.services.image_finder import find_images, ImageFinderError


# ── Constants ──────────────────────────────────────────────────────────────────
F5_TTS_BASE = "http://127.0.0.1:6902/api/v1"
POLL_INTERVAL = 1.0  # seconds

# ── Module-level stores ────────────────────────────────────────────────────────
progress_store = ProgressStore()
result_store: dict[str, dict] = {}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ffmpeg_cmd() -> str:
    ffmpeg_bin = aget_ffmpeg_bin_path_data()
    return str(ffmpeg_bin) if ffmpeg_bin else "ffmpeg"


def _fmt_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _make_srt(segments: list[dict]) -> str:
    lines: list[str] = []
    idx = 1
    for seg in segments:
        start = float(seg.get("start") or 0)
        end = float(seg.get("end") or start + 1)
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        lines.extend([
            str(idx),
            f"{_fmt_srt_time(start)} --> {_fmt_srt_time(end)}",
            text,
            "",
        ])
        idx += 1
    return "\n".join(lines)


def _extract_audio(job_store: JobStore, video_file_id: str) -> tuple[str, str]:
    """Extract MP3 audio from a registered video file. Returns (audio_file_id, download_url)."""
    file_record = job_store.get_file(video_file_id)
    if not file_record:
        raise RuntimeError(f"Video file_id '{video_file_id}' not found in job store")
    input_path = file_record.path
    if not input_path.exists():
        raise RuntimeError(f"Video file no longer on disk: {input_path}")
    output_path = input_path.with_suffix(".reup.mp3")
    subprocess.check_call([
        _ffmpeg_cmd(), "-i", str(input_path),
        "-vn", "-acodec", "libmp3lame", "-ar", "44100", "-ac", "2",
        "-y", str(output_path),
    ])
    audio_record = job_store.add_file(output_path, output_path.name)
    return audio_record.file_id, f"/api/v1/files/{audio_record.file_id}"


def _wait_for_f5_tts(task_id: str, timeout: int = 600) -> dict:
    """Poll F5-TTS download endpoint until audio is ready."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = httpx.get(
                f"{F5_TTS_BASE}/generate/download/{task_id}", timeout=10
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        time.sleep(2)
    raise TimeoutError(f"F5-TTS task '{task_id}' timed out after {timeout}s")


# ── Pipeline runner ────────────────────────────────────────────────────────────

def _run_pipeline(
    job_store: JobStore,
    pipeline_id: str,
    youtube_url: str,
    target_language: str,
    whisper_model: str,
    voice_id: str,
    image_sources: Optional[list[str]],
    number_of_images: int,
    llm_model: str,
) -> None:
    steps: dict[str, Any] = {}

    def _prog(percent: int, message: str, step: str = "") -> None:
        full_msg = f"[{step}] {message}" if step else message
        progress_store.set_progress(pipeline_id, "running", percent, full_msg)

    def _finish(error: Optional[str] = None) -> None:
        if error:
            progress_store.set_progress(pipeline_id, "error", 0, error)
        else:
            progress_store.set_progress(pipeline_id, "complete", 100, "Pipeline complete")
        result_store[pipeline_id] = {
            "pipeline_id": pipeline_id,
            "status": "error" if error else "complete",
            "youtube_url": youtube_url,
            "target_language": target_language,
            "steps": steps,
            "error": error,
        }

    try:
        # ── Step 1: Ingestion (0-15%) ─────────────────────────────────────────
        _prog(0, "Starting YouTube download...", "ingestion")
        video_job_id = start_download(job_store, youtube_url, "youtube", convert_to_h264=False)

        video_file_id: Optional[str] = None
        deadline = time.time() + 1800
        while time.time() < deadline:
            record = job_store.get_job(video_job_id)
            if record:
                if record.status == "complete":
                    res = record.result or {}
                    download_url = res.get("download_url", "")
                    # download_url = "/api/v1/files/{file_id}"
                    video_file_id = download_url.rsplit("/", 1)[-1] if download_url else None
                    steps["ingestion"] = {
                        "status": "ok",
                        "video_file_id": video_file_id,
                        "download_url": download_url,
                        "filename": res.get("filename"),
                        "codec": res.get("codec"),
                    }
                    _prog(15, "Video downloaded", "ingestion")
                    break
                elif record.status == "error":
                    raise RuntimeError(f"YouTube download failed: {record.error}")
            vid_prog = video_progress_store.get_payload(video_job_id)
            if vid_prog:
                pct = int((vid_prog.get("percent") or 0) * 0.14)
                progress_store.set_progress(
                    pipeline_id, "running", pct,
                    f"[ingestion] {vid_prog.get('message', 'Downloading...')}",
                )
            time.sleep(POLL_INTERVAL)
        else:
            raise TimeoutError("YouTube download timed out after 30 minutes")

        if not video_file_id:
            raise RuntimeError("Could not determine video file_id from download result")

        # ── Step 2: Audio Extraction (15-20%) ─────────────────────────────────
        _prog(15, "Extracting audio from video...", "audio_extraction")
        try:
            audio_file_id, audio_download_url = _extract_audio(job_store, video_file_id)
            steps["audio_extraction"] = {
                "status": "ok",
                "audio_file_id": audio_file_id,
                "download_url": audio_download_url,
            }
            _prog(20, "Audio extracted", "audio_extraction")
        except Exception as exc:
            steps["audio_extraction"] = {"status": "error", "error": str(exc)}
            raise RuntimeError(f"Audio extraction failed: {exc}") from exc

        # ── Step 3: Transcription (20-40%) ────────────────────────────────────
        _prog(20, "Loading Whisper and transcribing...", "transcription")
        audio_file_record = job_store.get_file(audio_file_id)
        if not audio_file_record:
            raise RuntimeError("Audio file record missing from job store")

        stt_task_id = stt_service.transcribe(
            job_store=job_store,
            file_path=audio_file_record.path,
            model=whisper_model,
            language=None,        # auto-detect source language
            add_punctuation=True,
            word_timestamps=True,
        )

        stt_result: Optional[dict] = None
        deadline = time.time() + 3600
        while time.time() < deadline:
            payload = stt_service.progress_store.get_payload(stt_task_id)
            if payload:
                status = payload.get("status")
                if status == "complete":
                    stt_result = stt_service.get_result(stt_task_id)
                    break
                elif status == "error":
                    raise RuntimeError(f"Whisper failed: {payload.get('message', '')}")
                pct = 20 + int((payload.get("percent") or 0) * 0.20)
                progress_store.set_progress(
                    pipeline_id, "running", pct,
                    f"[transcription] {payload.get('message', 'Transcribing...')}",
                )
            time.sleep(POLL_INTERVAL)
        else:
            raise TimeoutError("STT transcription timed out after 60 minutes")

        if not stt_result:
            raise RuntimeError("STT returned no result")

        transcript_text = stt_result.get("text_with_punctuation") or stt_result.get("text", "")
        transcript_segments: list[dict] = stt_result.get("segments") or []
        detected_language: str = stt_result.get("language") or "vi"
        steps["transcription"] = {
            "status": "ok",
            "text": transcript_text,
            "language": detected_language,
            "duration": stt_result.get("duration"),
            "segments_count": stt_result.get("segments_count", len(transcript_segments)),
        }
        _prog(40, f"Transcribed {len(transcript_segments)} segments (lang={detected_language})", "transcription")

        # ── Step 4: Translation (40-55%) ──────────────────────────────────────
        translated_text = transcript_text
        translated_segments: list[dict] = []

        if detected_language == target_language:
            translated_segments = [
                {"text": seg.get("text", ""), "start": seg.get("start"), "end": seg.get("end")}
                for seg in transcript_segments
            ]
            steps["translation"] = {
                "status": "skipped",
                "note": "Source and target language are the same",
                "translated_text": transcript_text,
                "segments": translated_segments,
            }
            _prog(55, "Translation skipped (same language)", "translation")
        else:
            _prog(40, f"Translating {detected_language} → {target_language}...", "translation")
            trans_job_id = start_translation(
                job_store=job_store,
                text=transcript_text,
                source_lang=detected_language,
                target_lang=target_language,
                segments=transcript_segments if transcript_segments else None,
                preserve_emotion=True,
            )
            trans_result: Optional[dict] = None
            deadline = time.time() + 3600
            while time.time() < deadline:
                record = job_store.get_job(trans_job_id)
                if record:
                    if record.status == "complete":
                        trans_result = record.result or {}
                        break
                    elif record.status == "error":
                        raise RuntimeError(f"Translation failed: {record.error}")
                t_prog = translation_progress.get_payload(trans_job_id)
                if t_prog:
                    t_pct = 40 + int((t_prog.get("percent") or 0) * 0.15)
                    progress_store.set_progress(
                        pipeline_id, "running", t_pct,
                        f"[translation] {t_prog.get('message', 'Translating...')}",
                    )
                time.sleep(POLL_INTERVAL)
            else:
                raise TimeoutError("Translation timed out after 60 minutes")

            translated_text = (trans_result or {}).get("translated_text", transcript_text)
            translated_segments = (trans_result or {}).get("segments") or []
            steps["translation"] = {
                "status": "ok",
                "translated_text": translated_text,
                "source_language": detected_language,
                "target_language": target_language,
                "segments": translated_segments,
                "segments_count": (trans_result or {}).get("segments_count", len(translated_segments)),
            }
            _prog(55, f"Translated ({len(translated_segments)} segments)", "translation")

        # ── Step 5: Audio Synthesis – F5-TTS (55-70%) ─────────────────────────
        _prog(55, "Generating synthesized voice via F5-TTS...", "synthesis")
        try:
            f5_resp = httpx.post(
                f"{F5_TTS_BASE}/generate",
                json={"voice_id": voice_id, "text": translated_text, "speed": 1.0},
                timeout=30,
            )
            f5_resp.raise_for_status()
            f5_task_id: str = f5_resp.json().get("task_id", "")
            if not f5_task_id:
                raise RuntimeError("F5-TTS returned no task_id")
            _prog(60, "Voice generation in progress...", "synthesis")
            f5_info = _wait_for_f5_tts(f5_task_id, timeout=600)
            steps["synthesis"] = {
                "status": "ok",
                "f5_task_id": f5_task_id,
                "filename": f5_info.get("filename"),
                "download_url": f"http://127.0.0.1:6902{f5_info.get('download_url', '')}",
            }
            _prog(70, "Voice synthesis complete", "synthesis")
        except Exception as exc:
            steps["synthesis"] = {"status": "error", "error": str(exc)}
            log(f"[reup-youtube] F5-TTS synthesis failed: {exc}", "warning", log_name="app-service.log")
            _prog(70, f"Voice synthesis failed (continuing): {exc}", "synthesis")

        # ── Step 6: Scene Assembly – ImageFinder (70-85%) ─────────────────────
        _prog(70, "Searching scene images...", "scene_assembly")
        try:
            image_result = find_images(
                text=transcript_text,
                number_of_images=number_of_images,
                target_words=15,
                model=llm_model,
                lang=target_language,
                timeout_seconds=60,
                sources=image_sources or None,
            )
            steps["scene_assembly"] = {
                "status": "ok",
                "keywords": image_result.get("keywords"),
                "search_query": image_result.get("search_query"),
                "images": image_result.get("images", []),
                "count": image_result.get("count", 0),
            }
            _prog(85, f"Found {image_result.get('count', 0)} scene images", "scene_assembly")
        except ImageFinderError as exc:
            steps["scene_assembly"] = {"status": "error", "error": str(exc)}
            log(f"[reup-youtube] Scene assembly failed: {exc}", "warning", log_name="app-service.log")
            _prog(85, f"Scene assembly failed (continuing): {exc}", "scene_assembly")
        except Exception as exc:
            steps["scene_assembly"] = {"status": "error", "error": str(exc)}
            log(f"[reup-youtube] Scene assembly error: {exc}", "warning", log_name="app-service.log")
            _prog(85, f"Scene assembly error (continuing): {exc}", "scene_assembly")

        # ── Step 7: Subtitle Generation (85-95%) ──────────────────────────────
        _prog(85, "Generating SRT subtitles...", "subtitles")
        try:
            # Use translated segments when available; fall back to originals
            sub_segments: list[dict] = translated_segments if translated_segments else [
                {"text": seg.get("text", ""), "start": seg.get("start"), "end": seg.get("end")}
                for seg in transcript_segments
            ]
            srt_content = _make_srt(sub_segments)

            TEMP_DIR.mkdir(parents=True, exist_ok=True)
            srt_path = TEMP_DIR / f"reup_{pipeline_id}.srt"
            srt_path.write_text(srt_content, encoding="utf-8")
            srt_record = job_store.add_file(srt_path, srt_path.name)

            # Prepare Remotion-compatible caption + asset data
            remotion_data = {
                "captions": sub_segments,
                "audio_url": steps.get("synthesis", {}).get("download_url"),
                "images": steps.get("scene_assembly", {}).get("images", []),
                "duration": steps["transcription"].get("duration"),
            }
            steps["subtitles"] = {
                "status": "ok",
                "srt": srt_content,
                "srt_download_url": f"/api/v1/files/{srt_record.file_id}",
                "segments_count": len(sub_segments),
                "remotion_data": remotion_data,
            }
            _prog(95, f"Subtitles generated ({len(sub_segments)} cues)", "subtitles")
        except Exception as exc:
            steps["subtitles"] = {"status": "error", "error": str(exc)}
            log(f"[reup-youtube] Subtitle generation failed: {exc}", "warning", log_name="app-service.log")
            _prog(95, f"Subtitle generation failed (continuing): {exc}", "subtitles")

        _finish()

    except Exception as exc:
        log(f"[reup-youtube] Pipeline {pipeline_id} failed: {exc}", "error", log_name="app-service.log")
        _finish(error=str(exc))


# ── Public API ─────────────────────────────────────────────────────────────────

def start_pipeline(
    job_store: JobStore,
    youtube_url: str,
    target_language: str,
    whisper_model: str,
    voice_id: str,
    image_sources: Optional[list[str]],
    number_of_images: int,
    llm_model: str,
) -> str:
    pipeline_id = f"reup_{uuid.uuid4().hex}"
    progress_store.set_progress(pipeline_id, "queued", 0, "Pipeline queued")
    threading.Thread(
        target=_run_pipeline,
        args=(
            job_store, pipeline_id, youtube_url, target_language,
            whisper_model, voice_id, image_sources, number_of_images, llm_model,
        ),
        daemon=True,
    ).start()
    return pipeline_id


def get_result(pipeline_id: str) -> Optional[dict]:
    return result_store.get(pipeline_id)
