"""Scene assembly for aligning visuals with narration timing.

Features delivered for task 9.1:
- create_scenes to segment video by transcript
- align_timing to match visuals with audio
- apply_transitions with fade effects
- Support ken burns effect for static images
"""

import random
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import Scene, TranscriptSegment, Transcript, VisualAsset, AssetType
from ..utils.file_utils import ensure_directory


class SceneAssemblerError(Exception):
    """Raised for scene assembly related failures."""


@dataclass
class TransitionConfig:
    """Configuration for scene transitions."""
    
    type: str = "fade"  # fade, crossfade, dissolve, wipe
    duration: float = 0.5  # seconds, minimum 0.5s
    
    def __post_init__(self):
        """Validate transition configuration."""
        if self.duration < 0.5:
            raise ValueError("Transition duration must be at least 0.5 seconds")
        if self.type not in ["fade", "crossfade", "dissolve", "wipe"]:
            raise ValueError(f"Invalid transition type: {self.type}")


@dataclass
class KenBurnsEffect:
    """Configuration for Ken Burns effect (zoom/pan for static images)."""
    
    zoom_start: float = 1.0  # initial zoom level
    zoom_end: float = 1.1  # final zoom level (subtle)
    pan_x_start: float = 0.0  # normalized -1 to 1
    pan_x_end: float = 0.0
    pan_y_start: float = 0.0
    pan_y_end: float = 0.0
    
    def __post_init__(self):
        """Validate Ken Burns parameters."""
        if not 1.0 <= self.zoom_start <= 1.3:
            raise ValueError("Zoom start must be between 1.0 and 1.3")
        if not 1.0 <= self.zoom_end <= 1.3:
            raise ValueError("Zoom end must be between 1.0 and 1.3")
        for val in [self.pan_x_start, self.pan_x_end, self.pan_y_start, self.pan_y_end]:
            if not -1.0 <= val <= 1.0:
                raise ValueError("Pan values must be between -1.0 and 1.0")


class SceneAssembler(LoggerMixin):
    """Assemble scenes by aligning visuals with audio narration timing."""

    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.temp_dir = ensure_directory(self.settings.cache_dir / "scene_assembly")
        self.default_transition = TransitionConfig()
        
    # ---------------------------
    # Scene Creation
    # ---------------------------
    
    def create_scenes(
        self,
        transcript: Transcript,
        visual_assets: Dict[str, VisualAsset],
        audio_segments: Optional[Dict[str, Path]] = None,
    ) -> List[Scene]:
        """
        Segment video by transcript, creating one scene per transcript segment.
        
        Args:
            transcript: The transcript with timing information
            visual_assets: Mapping of segment identifiers to visual assets
            audio_segments: Optional mapping of segment identifiers to audio file paths
            
        Returns:
            List of Scene objects with aligned timing
            
        Validates:
            - Property 20: Scene Segmentation Alignment (Requirements 7.1)
            - One scene per transcript segment
        """
        self.logger.info(
            "Creating scenes from transcript",
            language=transcript.language,
            segments=len(transcript.segments)
        )
        
        if not transcript.segments:
            raise SceneAssemblerError("Cannot create scenes from empty transcript")
        
        scenes: List[Scene] = []
        
        for i, segment in enumerate(transcript.segments):
            scene_id = f"scene_{i:04d}_{segment.start_time:.2f}"
            
            # Get visual asset for this segment (if available)
            visual_asset = visual_assets.get(scene_id)
            if visual_asset is None:
                # Try alternative matching strategies
                visual_asset = self._find_matching_asset(segment, visual_assets)
            
            # Get audio segment path (if available)
            audio_segment = None
            if audio_segments:
                audio_segment = audio_segments.get(scene_id)
            
            # Create scene with segment duration
            scene = Scene(
                scene_id=scene_id,
                transcript_segment=segment,
                visual_asset=visual_asset,
                audio_segment=audio_segment,
                duration=segment.duration,
                transition_type=self.default_transition.type,
            )
            
            scenes.append(scene)
            
            self.logger.debug(
                "Scene created",
                scene_id=scene_id,
                duration=f"{scene.duration:.2f}s",
                has_visual=scene.has_visual,
                has_audio=scene.has_audio,
            )
        
        self.logger.info(
            "Scenes created successfully",
            total_scenes=len(scenes),
            total_duration=f"{sum(s.duration for s in scenes):.2f}s"
        )
        
        return scenes
    
    def _find_matching_asset(
        self,
        segment: TranscriptSegment,
        visual_assets: Dict[str, VisualAsset]
    ) -> Optional[VisualAsset]:
        """Find a matching visual asset for a segment using fallback strategies."""
        # Strategy 1: Try to match by segment text keywords
        segment_words = set(segment.text.lower().split())
        
        best_match = None
        best_score = 0
        
        for asset_id, asset in visual_assets.items():
            asset_tags = set(tag.lower() for tag in asset.tags)
            overlap = len(segment_words & asset_tags)
            if overlap > best_score:
                best_score = overlap
                best_match = asset
        
        if best_match:
            self.logger.debug(
                "Matched asset by keywords",
                asset_id=best_match.asset_id,
                score=best_score
            )
        
        return best_match
    
    # ---------------------------
    # Timing Alignment
    # ---------------------------
    
    def align_timing(
        self,
        scene: Scene,
        audio_path: Optional[Path] = None,
        tolerance_ms: float = 100.0
    ) -> Scene:
        """
        Align scene timing to match audio duration precisely.
        
        Args:
            scene: The scene to align
            audio_path: Path to audio file for this scene
            tolerance_ms: Maximum acceptable timing difference in milliseconds
            
        Returns:
            Scene with adjusted timing
            
        Validates:
            - Property 21: Scene Duration Matching (Requirements 7.2)
            - Visual duration matches audio narration duration (within 100ms)
        """
        if audio_path and audio_path.exists():
            # Get actual audio duration
            audio_duration = self._get_audio_duration(audio_path)
            
            timing_diff_ms = abs(scene.duration - audio_duration) * 1000
            
            if timing_diff_ms > tolerance_ms:
                self.logger.warning(
                    "Scene duration misaligned with audio",
                    scene_id=scene.scene_id,
                    scene_duration=f"{scene.duration:.3f}s",
                    audio_duration=f"{audio_duration:.3f}s",
                    difference_ms=f"{timing_diff_ms:.1f}ms"
                )
                
                # Adjust scene duration to match audio
                scene.duration = audio_duration
                
                # Update transcript segment timing as well
                duration_delta = audio_duration - scene.transcript_segment.duration
                scene.transcript_segment.end_time += duration_delta
                
                self.logger.info(
                    "Scene timing adjusted to match audio",
                    scene_id=scene.scene_id,
                    new_duration=f"{scene.duration:.3f}s"
                )
            else:
                self.logger.debug(
                    "Scene timing aligned with audio",
                    scene_id=scene.scene_id,
                    difference_ms=f"{timing_diff_ms:.1f}ms"
                )
        else:
            self.logger.debug(
                "No audio file provided for timing alignment",
                scene_id=scene.scene_id
            )
        
        return scene
    
    def _get_audio_duration(self, audio_path: Path) -> float:
        """Get duration of audio file using ffprobe."""
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(audio_path)
                ],
                capture_output=True,
                text=True,
                check=True
            )
            duration = float(result.stdout.strip())
            return duration
        except (subprocess.CalledProcessError, ValueError) as exc:
            self.logger.error(
                "Failed to get audio duration",
                audio_path=str(audio_path),
                error=str(exc)
            )
            raise SceneAssemblerError(f"Failed to get audio duration: {exc}")
    
    # ---------------------------
    # Transitions
    # ---------------------------
    
    def apply_transitions(
        self,
        scenes: List[Scene],
        transition_config: Optional[TransitionConfig] = None
    ) -> List[Scene]:
        """
        Apply transitions between consecutive scenes.
        
        Args:
            scenes: List of scenes to process
            transition_config: Configuration for transitions (defaults to fade, 0.5s)
            
        Returns:
            List of scenes with transition information added
            
        Validates:
            - Property 22: Consecutive Scene Transitions (Requirements 7.3)
            - Transitions exist between all consecutive scene pairs
        """
        if not scenes:
            return scenes
        
        config = transition_config or self.default_transition
        
        self.logger.info(
            "Applying transitions to scenes",
            num_scenes=len(scenes),
            transition_type=config.type,
            transition_duration=f"{config.duration}s"
        )
        
        # Apply transition type to all scenes except the last one
        for i, scene in enumerate(scenes):
            if i < len(scenes) - 1:
                # Scene will transition into the next scene
                scene.transition_type = config.type
                self.logger.debug(
                    "Transition applied",
                    scene_id=scene.scene_id,
                    transition_to=scenes[i + 1].scene_id,
                    type=config.type
                )
            else:
                # Last scene has no outgoing transition
                scene.transition_type = "none"
                self.logger.debug(
                    "No outgoing transition",
                    scene_id=scene.scene_id
                )
        
        self.logger.info(
            "Transitions applied successfully",
            transitions_count=len(scenes) - 1
        )
        
        return scenes
    
    # ---------------------------
    # Visual Effects
    # ---------------------------
    
    def apply_ken_burns_effect(
        self,
        scenes: List[Scene],
        effect_probability: float = 0.7,
        subtle_mode: bool = True
    ) -> Dict[str, KenBurnsEffect]:
        """
        Generate Ken Burns effect configurations for static image scenes.
        
        Args:
            scenes: List of scenes to process
            effect_probability: Probability of applying effect to each static image
            subtle_mode: Use subtle zoom/pan (recommended for professional look)
            
        Returns:
            Dictionary mapping scene_id to KenBurnsEffect configuration
            
        Note:
            This generates effect parameters. Actual video rendering with the effect
            is handled by the VideoRenderer service.
        """
        ken_burns_effects: Dict[str, KenBurnsEffect] = {}
        
        self.logger.info(
            "Generating Ken Burns effects for static images",
            num_scenes=len(scenes),
            probability=effect_probability,
            subtle_mode=subtle_mode
        )
        
        static_scene_count = 0
        effect_applied_count = 0
        
        for scene in scenes:
            # Only apply to scenes with static images
            if not scene.has_visual:
                continue
                
            if scene.visual_asset.asset_type != AssetType.STATIC_IMAGE:
                continue
            
            static_scene_count += 1
            
            # Randomly decide whether to apply effect
            if random.random() > effect_probability:
                continue
            
            # Generate effect parameters
            if subtle_mode:
                zoom_range = (1.0, 1.1)  # subtle zoom
                pan_range = (-0.05, 0.05)  # minimal pan
            else:
                zoom_range = (1.0, 1.2)
                pan_range = (-0.1, 0.1)
            
            # Random zoom direction (in or out)
            if random.random() < 0.5:
                zoom_start, zoom_end = zoom_range
            else:
                zoom_end, zoom_start = zoom_range
            
            # Random pan direction
            pan_x_start = random.uniform(*pan_range)
            pan_x_end = random.uniform(*pan_range)
            pan_y_start = random.uniform(*pan_range)
            pan_y_end = random.uniform(*pan_range)
            
            effect = KenBurnsEffect(
                zoom_start=zoom_start,
                zoom_end=zoom_end,
                pan_x_start=pan_x_start,
                pan_x_end=pan_x_end,
                pan_y_start=pan_y_start,
                pan_y_end=pan_y_end,
            )
            
            ken_burns_effects[scene.scene_id] = effect
            effect_applied_count += 1
            
            self.logger.debug(
                "Ken Burns effect generated",
                scene_id=scene.scene_id,
                zoom=f"{zoom_start:.2f}→{zoom_end:.2f}",
                pan_x=f"{pan_x_start:.2f}→{pan_x_end:.2f}",
                pan_y=f"{pan_y_start:.2f}→{pan_y_end:.2f}"
            )
        
        self.logger.info(
            "Ken Burns effects generated",
            static_scenes=static_scene_count,
            effects_applied=effect_applied_count,
            application_rate=f"{effect_applied_count/max(static_scene_count, 1)*100:.1f}%"
        )
        
        return ken_burns_effects
    
    # ---------------------------
    # Validation
    # ---------------------------
    
    def validate_scene_alignment(
        self,
        scenes: List[Scene],
        transcript: Transcript,
        tolerance_ms: float = 100.0
    ) -> Tuple[bool, List[str]]:
        """
        Validate that scenes are properly aligned with transcript.
        
        Args:
            scenes: List of scenes to validate
            transcript: Original transcript
            tolerance_ms: Maximum acceptable timing difference in milliseconds
            
        Returns:
            Tuple of (is_valid, list of validation errors)
        """
        errors: List[str] = []
        
        # Check scene count matches transcript segments
        if len(scenes) != len(transcript.segments):
            errors.append(
                f"Scene count ({len(scenes)}) does not match "
                f"transcript segments ({len(transcript.segments)})"
            )
        
        # Check each scene's timing alignment
        for i, scene in enumerate(scenes):
            if i >= len(transcript.segments):
                break
            
            segment = transcript.segments[i]
            timing_diff_ms = abs(scene.duration - segment.duration) * 1000
            
            if timing_diff_ms > tolerance_ms:
                errors.append(
                    f"Scene {scene.scene_id} duration mismatch: "
                    f"{scene.duration:.3f}s vs segment {segment.duration:.3f}s "
                    f"(diff: {timing_diff_ms:.1f}ms)"
                )
        
        # Check transitions exist between consecutive scenes
        for i in range(len(scenes) - 1):
            if scenes[i].transition_type == "none":
                errors.append(
                    f"Missing transition between {scenes[i].scene_id} "
                    f"and {scenes[i + 1].scene_id}"
                )
        
        is_valid = len(errors) == 0
        
        if is_valid:
            self.logger.info("Scene alignment validation passed")
        else:
            self.logger.warning(
                "Scene alignment validation failed",
                error_count=len(errors)
            )
            for error in errors:
                self.logger.warning("Validation error", detail=error)
        
        return is_valid, errors
