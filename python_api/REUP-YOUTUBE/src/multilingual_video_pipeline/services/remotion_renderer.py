"""
Remotion Renderer Service - Python bridge for Remotion rendering

This module provides a Python interface to the Remotion rendering engine via Node.js.
It handles configuration serialization, process management, and error handling.
"""

import json
import subprocess
import os
import tempfile
from pathlib import Path
from typing import List, Optional, Literal
from dataclasses import dataclass, field, asdict
import logging

logger = logging.getLogger(__name__)


@dataclass
class Scene:
    """Configuration for a single scene"""
    image_path: str
    duration_frames: int
    transition_type: str = 'fade'
    transition_duration_frames: int = 15

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'imagePath': self.image_path,
            'durationFrames': self.duration_frames,
            'transitionType': self.transition_type,
            'transitionDurationFrames': self.transition_duration_frames,
        }


@dataclass
class RenderConfig:
    """Configuration for video rendering"""
    scenes: List[Scene]
    audio_path: str
    output_path: str
    width: int = 1920
    height: int = 1080
    fps: int = 30
    codec: Literal['h264', 'vp8', 'vp9', 'prores', 'h265'] = 'h264'
    crf: int = 18
    number_of_frames: Optional[int] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'scenes': [scene.to_dict() for scene in self.scenes],
            'audioPath': self.audio_path,
            'outputPath': self.output_path,
            'width': self.width,
            'height': self.height,
            'fps': self.fps,
            'codec': self.codec,
            'crf': self.crf,
            'numberOfFrames': self.number_of_frames,
        }


@dataclass
class RenderResult:
    """Result of a render operation"""
    output_path: str
    duration_seconds: float
    total_frames: int
    fps: int
    file_size_bytes: Optional[int] = None

    @property
    def file_size_mb(self) -> Optional[float]:
        """Get file size in megabytes"""
        if self.file_size_bytes is None:
            return None
        return self.file_size_bytes / 1024 / 1024


class RemotionRendererService:
    """
    Service for rendering videos using Remotion via Node.js subprocess

    This service handles:
    - Configuration serialization to JSON
    - Node.js subprocess management
    - Error handling and logging
    - File validation
    """

    def __init__(self, remotion_dir: Optional[str] = None, timeout_seconds: int = 3600):
        """
        Initialize Remotion renderer service

        Args:
            remotion_dir: Path to remotion-render directory.
                         Defaults to ../remotion-render from this file.
            timeout_seconds: Timeout for rendering process (default: 1 hour)
        """
        if remotion_dir is None:
            # Relative path from this file
            current_dir = Path(__file__).parent.parent.parent.parent
            remotion_dir = str(current_dir / 'remotion-render')

        self.remotion_dir = Path(remotion_dir)
        self.render_script = self.remotion_dir / 'dist' / 'render.js'
        self.timeout_seconds = timeout_seconds

        # Validate Remotion setup
        if not self.remotion_dir.exists():
            raise FileNotFoundError(f"Remotion directory not found: {self.remotion_dir}")

        logger.info(f"Initialized RemotionRendererService with dir: {self.remotion_dir}")

    def render_video(self, config: RenderConfig) -> RenderResult:
        """
        Render video using Remotion

        Args:
            config: RenderConfig object with all rendering parameters

        Returns:
            RenderResult with output path and metadata

        Raises:
            FileNotFoundError: If required files don't exist
            RuntimeError: If rendering fails
            TimeoutError: If rendering exceeds timeout
        """
        # Validate configuration
        self._validate_config(config)

        # Create temporary config file
        config_path = self._create_temp_config(config)

        try:
            logger.info(f"Starting render with config: {config_path}")
            print(f"\n📹 Rendering video...")
            print(f"   Scenes: {len(config.scenes)}")
            print(f"   Resolution: {config.width}x{config.height}")
            print(f"   FPS: {config.fps}")
            print(f"   Audio: {config.audio_path}")

            # Call Remotion render script
            result = self._invoke_remotion(config_path)

            # Verify output exists
            if not Path(config.output_path).exists():
                raise RuntimeError(
                    f"Output video not found after rendering: {config.output_path}"
                )

            # Get file size
            file_size = Path(config.output_path).stat().st_size

            # Calculate metadata
            total_frames = config.number_of_frames or sum(
                scene.duration_frames for scene in config.scenes
            )
            duration_seconds = total_frames / config.fps

            render_result = RenderResult(
                output_path=config.output_path,
                duration_seconds=duration_seconds,
                total_frames=total_frames,
                fps=config.fps,
                file_size_bytes=file_size,
            )

            logger.info(f"Render completed: {render_result}")
            print(f"\n✅ Render completed!")
            print(f"   Duration: {duration_seconds:.2f}s")
            print(f"   File size: {render_result.file_size_mb:.2f} MB\n")

            return render_result

        finally:
            # Clean up config file
            if config_path.exists():
                config_path.unlink()
                logger.debug(f"Cleaned up config file: {config_path}")

    def _validate_config(self, config: RenderConfig) -> None:
        """Validate render configuration"""
        if not config.scenes:
            raise ValueError("Config must include at least one scene")

        if not config.audio_path:
            raise ValueError("Config must include audio_path")

        if not config.output_path:
            raise ValueError("Config must include output_path")

        # Validate image paths
        for i, scene in enumerate(config.scenes):
            if not Path(scene.image_path).exists():
                raise FileNotFoundError(f"Scene {i} image not found: {scene.image_path}")

        # Validate audio path
        if not Path(config.audio_path).exists():
            raise FileNotFoundError(f"Audio file not found: {config.audio_path}")

        # Ensure output directory exists
        output_dir = Path(config.output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)

        logger.debug("Configuration validation passed")

    def _create_temp_config(self, config: RenderConfig) -> Path:
        """Create temporary config file"""
        fd, temp_path = tempfile.mkstemp(suffix='.json', prefix='remotion_render_')
        config_path = Path(temp_path)

        try:
            config_dict = config.to_dict()
            with open(config_path, 'w') as f:
                json.dump(config_dict, f, indent=2)

            logger.debug(f"Created config file: {config_path}")
            return config_path
        except Exception as e:
            config_path.unlink()
            raise RuntimeError(f"Failed to create config file: {e}") from e
        finally:
            os.close(fd)

    def _invoke_remotion(self, config_path: Path) -> None:
        """Execute Remotion rendering via Node.js subprocess"""
        cmd = ['node', str(self.render_script), str(config_path)]

        logger.info(f"Executing: {' '.join(cmd)}")

        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.remotion_dir),
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
            )

            # Log output
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr)

            if result.returncode != 0:
                raise RuntimeError(
                    f"Remotion rendering failed with code {result.returncode}: {result.stderr}"
                )

            logger.info("Remotion render completed successfully")

        except subprocess.TimeoutExpired:
            logger.error(f"Rendering timeout after {self.timeout_seconds} seconds")
            raise TimeoutError(
                f"Rendering exceeded timeout of {self.timeout_seconds} seconds"
            ) from None
        except Exception as e:
            logger.error(f"Failed to invoke Remotion: {e}")
            raise


# Example usage
if __name__ == '__main__':
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    try:
        service = RemotionRendererService()

        # Example configuration
        config = RenderConfig(
            scenes=[
                Scene(
                    image_path='path/to/image1.jpg',
                    duration_frames=90,
                ),
                Scene(
                    image_path='path/to/image2.jpg',
                    duration_frames=90,
                ),
            ],
            audio_path='path/to/audio.mp3',
            output_path='output.mp4',
            width=1920,
            height=1080,
            fps=30,
        )

        result = service.render_video(config)
        print(f"\n✓ Video rendered: {result.output_path}")
        sys.exit(0)

    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        sys.exit(1)
