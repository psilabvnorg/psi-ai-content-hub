"""Video rendering service combining scenes, audio, and subtitles with MoviePy.

Features delivered for task 12.1:
- render_video to combine scenes, audio, subtitles
- Support multiple output formats (16:9 and 9:16)
- Use H.264 codec with two-pass encoding
- Burn subtitles using MoviePy TextClip
- Implement platform-specific optimizations
"""

import subprocess
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, TYPE_CHECKING

import pysrt
from moviepy import AudioFileClip, ColorClip, CompositeVideoClip, TextClip

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import Scene, OutputFormat
from ..utils.file_utils import ensure_directory

if TYPE_CHECKING:
    from .subtitle_generator import Subtitle


class VideoRendererError(Exception):
    """Raised for video rendering related failures."""


@dataclass
class RenderConfig:
    """Configuration for video rendering."""
    
    # Encoding settings
    bitrate_video: str = "5000k"  # Target video bitrate
    bitrate_audio: str = "192k"   # Audio bitrate
    preset: str = "medium"        # ffmpeg preset: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
    crf: int = 23                 # Quality (0-51, lower = better, 23 is default)
    two_pass: bool = True         # Use two-pass encoding
    
    # Audio settings
    audio_codec: str = "aac"      # Audio codec
    audio_sample_rate: int = 48000  # 48kHz is standard for video
    
    # Performance
    threads: int = 0  # 0 = auto (use all available cores)
    
    def __post_init__(self):
        """Validate render configuration."""
        if self.crf < 0 or self.crf > 51:
            raise ValueError("CRF must be between 0 and 51")
        if self.threads < 0:
            raise ValueError("Threads must be non-negative (0 for auto)")
        if self.preset not in ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"]:
            raise ValueError(f"Invalid preset: {self.preset}")


@dataclass
class EncodingStats:
    """Statistics from video encoding process."""
    
    duration: float  # seconds
    bitrate: str     # e.g. "5000 kbits/s"
    fps: float       # frames per second
    size_mb: float   # file size in MB
    
    @property
    def efficiency(self) -> float:
        """Get compression efficiency (MB per second)."""
        if self.duration > 0:
            return self.size_mb / self.duration
        return 0.0


class VideoRenderer(LoggerMixin):
    """Render final video combining scenes, audio, and subtitles."""
    
    # Standard resolutions for different aspect ratios and platforms
    RESOLUTION_PRESETS = {
        "16:9": {
            "youtube": (1920, 1080),      # Full HD
            "tiktok": (1080, 1920),       # Wait, TikTok is 9:16, use correct one below
            "facebook": (1280, 720),      # HD
        },
        "9:16": {
            "youtube": (1080, 1920),      # Vertical for YouTube Shorts
            "tiktok": (1080, 1920),       # Native TikTok format
            "facebook": (1080, 1920),     # Vertical for Reels
        }
    }
    
    def __init__(self, settings=None, render_config: Optional[RenderConfig] = None):
        self.settings = settings or get_settings()
        self.temp_dir = ensure_directory(self.settings.cache_dir / "video_rendering")
        self.render_config = render_config or RenderConfig()
        self.ffmpeg_log_level = "warning"  # Can be changed to "verbose" for debugging
    
    # ---------------------------
    # Main Video Rendering
    # ---------------------------
    
    def render_video(
        self,
        scenes: List[Scene],
        output_format: OutputFormat,
        subtitles: Optional[str] = None,
        output_path: Optional[Path] = None,
        audio_path: Optional[Path] = None,
    ) -> Path:
        """
        Render final video combining scenes, audio, and subtitles.
        
        Args:
            scenes: List of Scene objects to render
            output_format: Output format specification (language, aspect_ratio, resolution, platform)
            subtitles: Optional path to SRT subtitle file to burn into video
            output_path: Path for output video file (auto-generated if not provided)
            audio_path: Path to audio file to mix with the video
            
        Returns:
            Path to rendered video file
            
        Validates:
            - Property 14: Language Output Completeness (Requirements 5.1)
            - Property 15: Horizontal Format Consistency (Requirements 5.2)
            - Property 16: Vietnamese Vertical Format (Requirements 5.3)
        """
        self.logger.info(
            "Starting video rendering",
            scenes=len(scenes),
            language=output_format.language,
            aspect_ratio=output_format.aspect_ratio,
            platform=output_format.platform,
            audio_path=str(audio_path) if audio_path else None
        )
        
        if not scenes:
            raise VideoRendererError("Cannot render video with empty scene list")
        
        # Generate output path if not provided
        if output_path is None:
            timestamp = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = self.temp_dir / f"video_{output_format.language}_{timestamp}.mp4"
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create concatenation file for FFmpeg
        concat_file = self._create_concat_file(scenes, output_format)
        
        try:
            # Render video with two-pass encoding
            if self.render_config.two_pass:
                self._render_two_pass(concat_file, output_path, output_format, None, audio_path)
            else:
                self._render_single_pass(concat_file, output_path, output_format, None, audio_path)
            
            if not output_path.exists():
                raise VideoRendererError(f"Video rendering failed: output file not created")
            
            # Burn subtitles if provided (post-processing with MoviePy)
            if subtitles and Path(subtitles).exists():
                self.logger.info(f"Burning subtitles into video: {subtitles}")
                self._burn_subtitles(output_path, subtitles)
            
            # Log encoding statistics
            stats = self._get_encoding_stats(output_path)
            
            self.logger.info(
                "Video rendering completed successfully",
                output_path=str(output_path),
                duration=f"{stats.duration:.2f}s",
                size_mb=f"{stats.size_mb:.2f}MB",
                efficiency=f"{stats.efficiency:.4f}MB/s"
            )
            
        finally:
            # Clean up temporary concat file
            if concat_file.exists():
                concat_file.unlink()
        
        return output_path
    
    def _create_concat_file(
        self,
        scenes: List[Scene],
        output_format: OutputFormat,
    ) -> Path:
        """Create FFmpeg concat demuxer file for scene concatenation."""
        concat_file = self.temp_dir / "concat.txt"
        
        with open(concat_file, 'w', encoding='utf-8') as f:
            for scene in scenes:
                if scene.has_visual and scene.visual_asset:
                    # Create a silent video from the image
                    image_video = self._create_image_video_clip(
                        scene.visual_asset.file_path,
                        scene.duration,
                        output_format
                    )
                    # Use absolute path in concat file
                    f.write(f"file '{image_video.absolute()}'\n")
                else:
                    # Create blank video for scenes without visuals
                    blank_video = self._create_blank_video_clip(
                        scene.duration,
                        output_format
                    )
                    # Use absolute path in concat file
                    f.write(f"file '{blank_video.absolute()}'\n")
        
        self.logger.debug("Concat file created", path=str(concat_file), scenes=len(scenes))
        return concat_file
    
    def _create_image_video_clip(
        self,
        image_path: Path,
        duration: float,
        output_format: OutputFormat,
    ) -> Path:
        """Create a video clip from a static image with Ken Burns effect."""
        if not image_path.exists():
            raise VideoRendererError(f"Image file not found: {image_path}")
        
        output_clip = self.temp_dir / f"clip_{id(image_path)}.mp4"
        
        # Ken Burns effect with subtle zoom/pan
        filter_str = (
            f"scale={output_format.width}:{output_format.height}:force_original_aspect_ratio=decrease,"
            f"pad={output_format.width}:{output_format.height}:(ow-iw)/2:(oh-ih)/2,"
            f"zoompan=z='min(zoom+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=30"
        )
        
        command = [
            "ffmpeg",
            "-loglevel", self.ffmpeg_log_level,
            "-loop", "1",
            "-i", str(image_path),
            "-c:v", self.settings.video_codec,
            "-t", str(duration),
            "-vf", filter_str,
            "-pix_fmt", "yuv420p",
            "-y",
            str(output_clip)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error(
                "Failed to create image video clip",
                image=str(image_path),
                stderr=result.stderr
            )
            raise VideoRendererError(f"Failed to create video clip from image: {result.stderr}")
        
        self.logger.debug(
            "Image video clip created",
            image=str(image_path),
            duration=f"{duration:.2f}s",
            output=str(output_clip)
        )
        
        return output_clip
    
    def _create_blank_video_clip(
        self,
        duration: float,
        output_format: OutputFormat,
    ) -> Path:
        """Create a blank (black) video clip."""
        output_clip = self.temp_dir / f"blank_{duration}_{id(output_format)}.mp4"
        
        command = [
            "ffmpeg",
            "-loglevel", self.ffmpeg_log_level,
            "-f", "lavfi",
            "-i", f"color=c=black:s={output_format.width}x{output_format.height}:d={duration}",
            "-f", "lavfi",
            "-i", "anullsrc=r=48000:cl=mono:d=" + str(duration),
            "-c:v", self.settings.video_codec,
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
            "-y",
            str(output_clip)
        ]
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            raise VideoRendererError(f"Failed to create blank video clip: {result.stderr}")
        
        return output_clip
    
    def _render_single_pass(
        self,
        concat_file: Path,
        output_path: Path,
        output_format: OutputFormat,
        subtitles: Optional[str] = None,
        audio_path: Optional[Path] = None,
    ) -> None:
        """Render video with single-pass encoding."""
        self.logger.info("Starting single-pass video encoding", output_path=str(output_path))
        
        # Build FFmpeg command
        command = [
            "ffmpeg",
            "-loglevel", self.ffmpeg_log_level,
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
        ]
        
        # Add audio input if provided
        audio_input_index = None
        if audio_path and audio_path.exists():
            audio_input_index = 1  # Second input (after concat file)
            command.extend(["-i", str(audio_path)])
            self.logger.info(f"Adding audio track: {audio_path}")
        
        # Add stream mapping to ensure correct audio is used
        if audio_input_index is not None:
            # Map video from concat demuxer (input 0) and audio from file (input 1)
            command.extend(["-map", "0:v:0"])  # Take video from input 0 (concat)
            command.extend(["-map", f"{audio_input_index}:a:0"])  # Take audio from input 1 (audio file)
        
        command.extend([
            "-c:v", self.settings.video_codec,
            "-preset", self.render_config.preset,
            "-crf", str(self.render_config.crf),
            "-b:v", self.render_config.bitrate_video,
            "-c:a", self.render_config.audio_codec,
            "-b:a", self.render_config.bitrate_audio,
            "-ar", str(self.render_config.audio_sample_rate),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-threads", str(self.render_config.threads),
            "-y", str(output_path)
        ])
        
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error(
                "FFmpeg single-pass encoding failed",
                stderr=result.stderr,
                stdout=result.stdout
            )
            raise VideoRendererError(f"Video rendering failed: {result.stderr}")
    
    def _render_two_pass(
        self,
        concat_file: Path,
        output_path: Path,
        output_format: OutputFormat,
        subtitles: Optional[str] = None,
        audio_path: Optional[Path] = None,
    ) -> None:
        """Render video with two-pass H.264 encoding for better quality/size tradeoff."""
        self.logger.info("Starting two-pass video encoding", output_path=str(output_path))
        
        logfile = self.temp_dir / "ffmpeg_2pass.log"
        
        # Common arguments for both passes
        common_args = [
            "ffmpeg",
            "-loglevel", self.ffmpeg_log_level,
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
        ]
        
        # Add audio input if provided
        audio_input_index = None
        if audio_path and audio_path.exists():
            audio_input_index = 1  # Second input (after concat file)
            common_args.extend(["-i", str(audio_path)])
            self.logger.info(f"Adding audio track: {audio_path}")
        
        # Add stream mapping to ensure correct audio is used
        if audio_input_index is not None:
            # Map video from concat demuxer (input 0) and audio from file (input 1)
            common_args.extend(["-map", "0:v:0"])  # Take video from input 0 (concat)
            common_args.extend(["-map", f"{audio_input_index}:a:0"])  # Take audio from input 1 (audio file)
        
        # Common codec and quality settings
        common_args.extend([
            "-c:v", self.settings.video_codec,
            "-preset", self.render_config.preset,
            "-b:v", self.render_config.bitrate_video,
            "-c:a", self.render_config.audio_codec,
            "-b:a", self.render_config.bitrate_audio,
            "-ar", str(self.render_config.audio_sample_rate),
            "-pix_fmt", "yuv420p",
            "-threads", str(self.render_config.threads),
        ])
        
        # Pass 1: Analysis pass (no output)
        self.logger.debug("Two-pass encoding: Pass 1 (analysis)")
        
        pass1_command = common_args + [
            "-pass", "1",
            "-f", "null",
            "/dev/null"
        ]
        
        result = subprocess.run(pass1_command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error("Two-pass encoding pass 1 failed", stderr=result.stderr)
            raise VideoRendererError(f"Two-pass encoding failed at pass 1: {result.stderr}")
        
        # Pass 2: Encoding pass (with output)
        self.logger.debug("Two-pass encoding: Pass 2 (encoding)")
        
        pass2_command = common_args + [
            "-pass", "2",
            "-movflags", "+faststart",
        ]
        
        pass2_command.extend(["-y", str(output_path)])
        
        result = subprocess.run(pass2_command, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            self.logger.error("Two-pass encoding pass 2 failed", stderr=result.stderr)
            raise VideoRendererError(f"Two-pass encoding failed at pass 2: {result.stderr}")
        
        # Clean up log file
        if logfile.exists():
            logfile.unlink()
    
    def _get_encoding_stats(self, video_path: Path) -> EncodingStats:
        """Extract encoding statistics from rendered video."""
        try:
            # Use ffprobe to get video information
            command = [
                "ffprobe",
                "-v", "error",
                "-show_format",
                "-show_streams",
                "-of", "json",
                str(video_path)
            ]
            
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            # Extract relevant statistics
            duration = float(data.get('format', {}).get('duration', 0))
            bitrate = data.get('format', {}).get('bit_rate', '0')
            
            # Convert bitrate to human readable format
            bitrate_num = int(bitrate) // 1000 if bitrate else 0
            bitrate_str = f"{bitrate_num}k"
            
            # Get FPS from video stream
            fps = 30.0  # default
            for stream in data.get('streams', []):
                if stream.get('codec_type') == 'video':
                    if 'r_frame_rate' in stream:
                        num, denom = map(float, stream['r_frame_rate'].split('/'))
                        fps = num / denom if denom > 0 else 30.0
            
            # Get file size in MB
            size_mb = video_path.stat().st_size / (1024 * 1024)
            
            return EncodingStats(
                duration=duration,
                bitrate=bitrate_str,
                fps=fps,
                size_mb=size_mb
            )
        
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as exc:
            self.logger.warning(
                "Failed to extract encoding stats",
                error=str(exc)
            )
            return EncodingStats(
                duration=0.0,
                bitrate="unknown",
                fps=30.0,
                size_mb=0.0
            )
    
    # ---------------------------
    # Format Validation
    # ---------------------------
    
    def validate_output_format(
        self,
        output_format: OutputFormat,
        video_path: Optional[Path] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Validate output format specifications.
        
        Args:
            output_format: Output format to validate
            video_path: Optional path to video to check format
            
        Returns:
            Tuple of (is_valid, list of validation errors)
        """
        errors: List[str] = []
        
        # Validate aspect ratio matches resolution
        expected_resolution = self.RESOLUTION_PRESETS.get(
            output_format.aspect_ratio, {}
        ).get(output_format.platform)
        
        if expected_resolution and output_format.resolution != expected_resolution:
            errors.append(
                f"Resolution {output_format.resolution} doesn't match "
                f"expected {expected_resolution} for "
                f"{output_format.aspect_ratio} {output_format.platform}"
            )
        
        # If video file provided, validate its properties
        if video_path and video_path.exists():
            try:
                command = [
                    "ffprobe",
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height",
                    "-of", "json",
                    str(video_path)
                ]
                
                result = subprocess.run(command, capture_output=True, text=True, check=True)
                data = json.loads(result.stdout)
                
                if data['streams']:
                    actual_width = data['streams'][0].get('width', 0)
                    actual_height = data['streams'][0].get('height', 0)
                    
                    if (actual_width, actual_height) != output_format.resolution:
                        errors.append(
                            f"Video resolution ({actual_width}x{actual_height}) "
                            f"doesn't match expected ({output_format.width}x{output_format.height})"
                        )
            
            except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
                self.logger.warning(
                    "Failed to validate video format",
                    error=str(exc)
                )
        
        is_valid = len(errors) == 0
        
        if is_valid:
            self.logger.info("Output format validation passed")
        else:
            self.logger.warning(
                "Output format validation failed",
                error_count=len(errors)
            )
        
        return is_valid, errors
    
    def _parse_srt(self, srt_path: Path) -> List[Tuple[float, float, str]]:
        """Parse SRT subtitle file into (start_time, end_time, text) tuples."""
        subtitles = []
        
        with open(srt_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        
        # Split by double newlines to get individual subtitle blocks
        blocks = re.split(r'\n\s*\n', content.strip())
        
        for block in blocks:
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue
            
            # Parse timing line (e.g., "00:00:00,000 --> 00:00:05,000")
            timing_match = re.match(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})', lines[1])
            if not timing_match:
                continue
            
            # Convert to seconds
            start_h, start_m, start_s, start_ms, end_h, end_m, end_s, end_ms = map(int, timing_match.groups())
            start_time = start_h * 3600 + start_m * 60 + start_s + start_ms / 1000.0
            end_time = end_h * 3600 + end_m * 60 + end_s + end_ms / 1000.0
            
            # Join remaining lines as subtitle text
            text = '\n'.join(lines[2:])
            
            subtitles.append((start_time, end_time, text))
        
        return subtitles
    
    def _burn_subtitles(self, video_path: Path, subtitle_path: Path) -> None:
        """Burn subtitles into video using MoviePy and pysrt."""
        try:
            import pysrt
            from moviepy import VideoFileClip, TextClip, CompositeVideoClip
            
            self.logger.info(f"Loading video and subtitles for burning")
            self.logger.info(f"Video path: {video_path}, exists: {video_path.exists()}")
            self.logger.info(f"Subtitle path: {subtitle_path}, exists: {Path(subtitle_path).exists()}")
            
            if not video_path.exists():
                self.logger.warning(f"Video file not found: {video_path}")
                return
            
            if not Path(subtitle_path).exists():
                self.logger.warning(f"Subtitle file not found: {subtitle_path}")
                return
            
            # Load video
            video = VideoFileClip(str(video_path))
            self.logger.info(f"Video loaded successfully, size: {video.size}, duration: {video.duration}s")
            
            # Load SRT file
            subtitles = pysrt.open(str(subtitle_path))
            self.logger.info(f"Loaded {len(subtitles)} subtitles from SRT file")
            
            # Create subtitle clips
            subtitle_clips = []
            video_width, video_height = video.size
            self.logger.info(f"Video dimensions: {video_width}x{video_height}")
            
            for idx, subtitle in enumerate(subtitles):
                start_time = self._srt_time_to_seconds(subtitle.start)
                end_time = self._srt_time_to_seconds(subtitle.end)
                duration = end_time - start_time
                
                self.logger.debug(f"Subtitle {idx}: {start_time:.2f}s - {end_time:.2f}s, duration: {duration:.2f}s, text: {subtitle.text[:50]}")
                
                # Calculate text width and height with padding
                text_width = int(video_width * 3 / 4)
                font_size = 24
                line_height = int(font_size * 1.4)  # 1.4x multiplier for line spacing
                num_lines = max(1, len(subtitle.text.split('\n')))  # Count actual lines
                text_height = line_height * num_lines + 20  # Add padding
                
                # Create text clip with yellow text
                try:
                    text_clip = TextClip(
                        text=subtitle.text,
                        font_size=font_size,
                        color='yellow',
                        bg_color=None,
                        size=(text_width, text_height),
                        method='caption',
                        duration=duration
                    )
                    
                    # Set timing using moviepy API (try new API first, then fallback)
                    try:
                        # Try moviepy 1.0+ API with with_start/with_duration
                        text_clip = text_clip.with_start(start_time).with_duration(duration)
                    except AttributeError:
                        try:
                            # Try moviepy < 1.0 API with set_start/set_duration
                            text_clip = text_clip.set_start(start_time).set_duration(duration)
                        except AttributeError:
                            # If both fail, use direct timing attributes
                            text_clip = text_clip.set_duration(duration)
                            text_clip = text_clip.with_start(start_time)
                    
                    # Position at bottom center with proper vertical padding
                    # Calculate Y position to ensure text doesn't get cut off at bottom
                    vertical_padding = 30  # Padding from bottom
                    y_position = int(video_height - text_height - vertical_padding)
                    position = ('center', y_position)
                    try:
                        text_clip = text_clip.with_position(position)
                    except AttributeError:
                        text_clip = text_clip.set_position(position)
                    
                    subtitle_clips.append(text_clip)
                except Exception as clip_err:
                    self.logger.warning(f"Failed to create subtitle clip {idx}: {clip_err}, skipping this subtitle")
                    # Skip problematic subtitle rather than fail
                    continue
            
            self.logger.info(f"Created {len(subtitle_clips)} subtitle clips successfully")
            
            if len(subtitle_clips) == 0:
                self.logger.warning("No subtitle clips were created")
                video.close()
                return
            
            # Composite video with subtitles
            self.logger.info(f"Compositing video with {len(subtitle_clips)} subtitle clips")
            final_video = CompositeVideoClip([video] + subtitle_clips)
            
            # Create temporary output
            temp_output = video_path.parent / f"{video_path.stem}_with_subs{video_path.suffix}"
            
            self.logger.info(f"Writing video with burned subtitles to {temp_output}")
            
            # Write output video with subtitle burning
            final_video.write_videofile(
                str(temp_output),
                codec="libx264",
                audio_codec="aac",
                preset=self.render_config.preset,
                threads=self.render_config.threads if self.render_config.threads > 0 else None,
                logger=None  # Suppress MoviePy's verbose output
            )
            
            # Clean up
            video.close()
            final_video.close()
            
            # Replace original with subtitled version
            if temp_output.exists():
                video_path.unlink()
                temp_output.rename(video_path)
                self.logger.info(f"Subtitles burned successfully into {video_path}")
            else:
                self.logger.error(f"Temporary output file was not created: {temp_output}")
            
        except ImportError as e:
            self.logger.error(f"Missing dependencies for subtitle burning: {e}")
            self.logger.warning("Install pysrt and moviepy: pip install pysrt moviepy")
            self.logger.warning("Continuing without burned subtitles")
        except Exception as e:
            self.logger.error(f"Error burning subtitles: {e}", exc_info=True)
            # Non-fatal - video is still usable without burned subtitles
            self.logger.warning("Continuing without burned subtitles")
    
    def _srt_time_to_seconds(self, time_obj) -> float:
        """Convert pysrt time object to seconds."""
        return time_obj.hours * 3600 + time_obj.minutes * 60 + time_obj.seconds + time_obj.milliseconds / 1000
