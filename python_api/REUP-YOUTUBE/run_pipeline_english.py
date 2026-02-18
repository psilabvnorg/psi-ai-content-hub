"""
Run the multilingual pipeline for a single YouTube video and produce an English output.

Usage:
    python run_pipeline_english.py --url https://youtube.com/watch?v=... [--formats 16:9 9:16]

Notes:
- Requires all pipeline dependencies (FFmpeg, yt-dlp, Whisper/PhoWhisper, translation model, etc.).
- Outputs are written under the pipeline cache/output directory defined in settings.
"""

import argparse
import sys
from typing import List

from src.multilingual_video_pipeline.config import get_settings
from src.multilingual_video_pipeline.services import (
    MultilingualVideoPipeline,
    PipelineError,
    ProgressCallback,
)


class ConsoleProgressCallback(ProgressCallback):
    """Minimal console progress reporter."""

    def on_stage_start(self, stage_name: str, total_items: int = 1) -> None:
        print(f"\n[START] {stage_name} (items: {total_items})", flush=True)

    def on_stage_progress(self, stage_name: str, current: int, total: int, status_msg: str = "") -> None:
        pct = (current / total * 100) if total else 0
        msg = f"[PROGRESS] {stage_name}: {current}/{total} ({pct:.0f}%)"
        if status_msg:
            msg += f" - {status_msg}"
        print(msg, flush=True)

    def on_stage_complete(self, stage_name: str, output_info):
        print(f"[DONE] {stage_name} -> {output_info}", flush=True)

    def on_stage_error(self, stage_name: str, error: str) -> None:
        print(f"[ERROR] {stage_name}: {error}", file=sys.stderr, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run pipeline for one YouTube video in English")
    parser.add_argument("--url", required=True, help="YouTube video URL to process")
    parser.add_argument(
        "--formats",
        nargs="+",
        default=["16:9"],
        help="Output aspect ratios (e.g., 16:9 9:16). Default: 16:9",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Initialize pipeline
    settings = get_settings()
    callback = ConsoleProgressCallback()
    pipeline = MultilingualVideoPipeline(settings, callback)

    try:
        # Submit a job for English only
        job_id = pipeline.submit_job(
            video_url=args.url,
            target_languages=["en"],
            output_formats=args.formats,
        )
        print(f"Submitted job: {job_id}")

        # Process the job end-to-end
        result = pipeline.process_job(job_id)
        print("\n✅ Pipeline completed")
        print(f"Job ID: {result['job_id']}")
        print(f"Status: {result['status']}")
        print(f"Output directory: {result['output_dir']}")
        print(f"Duration (s): {result['duration_seconds']:.2f}")
        print(f"Formats: {', '.join(result['formats'])}")
        return 0

    except PipelineError as e:
        print(f"❌ Pipeline failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
