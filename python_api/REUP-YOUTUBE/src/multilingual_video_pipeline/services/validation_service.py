"""
Validation Service for Quality Checks

This module provides comprehensive validation utilities for the multilingual video pipeline:
- Resolution validation (Requirement 10.1)
- Audio level validation (Requirement 10.2)
- Subtitle synchronization validation (Requirement 10.4)
- Output format completeness check (Requirement 10.5)

The ValidationService ensures all generated videos meet quality standards before delivery.
"""

import json
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..logging_config import LoggerMixin
from ..utils.file_utils import ensure_directory


class ValidationSeverity(str, Enum):
    """Severity levels for validation issues"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationIssue:
    """Represents a validation issue found during quality checks"""
    severity: ValidationSeverity
    category: str  # "resolution", "audio", "subtitle", "format"
    message: str
    details: Dict = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization"""
        return {
            "severity": self.severity.value,
            "category": self.category,
            "message": self.message,
            "details": self.details
        }


@dataclass
class ValidationReport:
    """Comprehensive validation report for a video or batch"""
    video_path: str
    passed: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)
    
    def add_issue(self, issue: ValidationIssue):
        """Add validation issue and update pass/fail status"""
        self.issues.append(issue)
        # Fail if any error or critical issue
        if issue.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL]:
            self.passed = False
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization"""
        return {
            "video_path": self.video_path,
            "passed": self.passed,
            "issues": [issue.to_dict() for issue in self.issues],
            "metadata": self.metadata
        }
    
    def save(self, output_path: Path):
        """Save validation report to JSON file"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)


class ValidationServiceError(Exception):
    """Custom exception for validation service errors"""
    pass


class ValidationService(LoggerMixin):
    """
    Service for validating video quality across multiple dimensions
    
    Validates:
    - Resolution: Minimum 1080p for all outputs
    - Audio levels: -20 LUFS to -12 LUFS range
    - Subtitle sync: Maximum 100ms drift
    - Format completeness: All required outputs generated
    """
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize validation service
        
        Args:
            cache_dir: Directory for storing validation reports
        """
        super().__init__()
        self.cache_dir = cache_dir or Path("cache/validation")
        ensure_directory(self.cache_dir)
        
        self.logger.info(
            "ValidationService initialized",
            cache_dir=str(self.cache_dir)
        )
    
    def validate_video(
        self,
        video_path: Path,
        expected_formats: Optional[List[str]] = None,
        check_audio: bool = True,
        check_subtitles: bool = True
    ) -> ValidationReport:
        """
        Perform comprehensive validation on a video file
        
        Args:
            video_path: Path to video file to validate
            expected_formats: List of expected output formats (e.g., ["16:9", "9:16"])
            check_audio: Whether to validate audio levels
            check_subtitles: Whether to validate subtitle synchronization
        
        Returns:
            ValidationReport with all findings
        """
        self.logger.info(
            "Starting video validation",
            video_path=str(video_path),
            check_audio=check_audio,
            check_subtitles=check_subtitles
        )
        
        if not video_path.exists():
            raise ValidationServiceError(f"Video file not found: {video_path}")
        
        report = ValidationReport(
            video_path=str(video_path),
            passed=True,
            metadata={"file_size": video_path.stat().st_size}
        )
        
        # Validate resolution (Requirement 10.1)
        self._validate_resolution(video_path, report)
        
        # Validate audio levels (Requirement 10.2)
        if check_audio:
            self._validate_audio_levels(video_path, report)
        
        # Validate subtitle synchronization (Requirement 10.4)
        if check_subtitles:
            self._validate_subtitle_sync(video_path, report)
        
        self.logger.info(
            "Video validation completed",
            video_path=str(video_path),
            passed=report.passed,
            issues_count=len(report.issues)
        )
        
        return report
    
    def validate_batch_outputs(
        self,
        output_dir: Path,
        expected_languages: List[str],
        expected_formats: Dict[str, List[str]]
    ) -> ValidationReport:
        """
        Validate completeness of batch output generation (Requirement 10.5)
        
        Args:
            output_dir: Directory containing output files
            expected_languages: List of language codes (e.g., ["en", "vi", "ja", "de"])
            expected_formats: Dict mapping language to formats (e.g., {"vi": ["16:9", "9:16"], "en": ["16:9"]})
        
        Returns:
            ValidationReport with completeness findings
        """
        self.logger.info(
            "Validating batch output completeness",
            output_dir=str(output_dir),
            expected_languages=expected_languages
        )
        
        report = ValidationReport(
            video_path=str(output_dir),
            passed=True,
            metadata={
                "expected_languages": expected_languages,
                "expected_formats": expected_formats
            }
        )
        
        if not output_dir.exists():
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.CRITICAL,
                category="format",
                message="Output directory does not exist",
                details={"path": str(output_dir)}
            ))
            return report
        
        # Check each language directory
        for lang in expected_languages:
            lang_dir = output_dir / lang
            
            if not lang_dir.exists():
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="format",
                    message=f"Missing language directory: {lang}",
                    details={"language": lang, "path": str(lang_dir)}
                ))
                continue
            
            # Check format directories
            formats = expected_formats.get(lang, ["16:9"])
            for fmt in formats:
                fmt_dir = lang_dir / fmt
                
                if not fmt_dir.exists():
                    report.add_issue(ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        category="format",
                        message=f"Missing format directory: {lang}/{fmt}",
                        details={"language": lang, "format": fmt, "path": str(fmt_dir)}
                    ))
                    continue
                
                # Check for required files
                video_files = list(fmt_dir.glob("*.mp4"))
                metadata_files = list(fmt_dir.glob("metadata.json"))
                thumbnail_files = list(fmt_dir.glob("thumbnail.*"))
                
                if not video_files:
                    report.add_issue(ValidationIssue(
                        severity=ValidationSeverity.ERROR,
                        category="format",
                        message=f"Missing video file in {lang}/{fmt}",
                        details={"language": lang, "format": fmt, "path": str(fmt_dir)}
                    ))
                
                if not metadata_files:
                    report.add_issue(ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        category="format",
                        message=f"Missing metadata file in {lang}/{fmt}",
                        details={"language": lang, "format": fmt}
                    ))
                
                if not thumbnail_files:
                    report.add_issue(ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        category="format",
                        message=f"Missing thumbnail in {lang}/{fmt}",
                        details={"language": lang, "format": fmt}
                    ))
        
        self.logger.info(
            "Batch output validation completed",
            passed=report.passed,
            issues_count=len(report.issues)
        )
        
        return report
    
    def _validate_resolution(self, video_path: Path, report: ValidationReport):
        """
        Validate video meets minimum 1080p resolution (Requirement 10.1)
        
        Args:
            video_path: Path to video file
            report: ValidationReport to update with findings
        """
        try:
            # Use ffprobe to get video resolution
            cmd = [
                "ffprobe",
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "json",
                str(video_path)
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            
            data = json.loads(result.stdout)
            if not data.get("streams"):
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="resolution",
                    message="No video stream found",
                    details={"video_path": str(video_path)}
                ))
                return
            
            stream = data["streams"][0]
            width = stream.get("width", 0)
            height = stream.get("height", 0)
            
            report.metadata["resolution"] = {"width": width, "height": height}
            
            # Check minimum 1080p (1920x1080 for 16:9, 1080x1920 for 9:16)
            min_dimension = 1080
            
            if width < min_dimension and height < min_dimension:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="resolution",
                    message=f"Resolution below minimum 1080p: {width}x{height}",
                    details={
                        "width": width,
                        "height": height,
                        "minimum": min_dimension
                    }
                ))
            elif width < min_dimension or height < min_dimension:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="resolution",
                    message=f"One dimension below 1080p: {width}x{height}",
                    details={
                        "width": width,
                        "height": height,
                        "minimum": min_dimension
                    }
                ))
            else:
                self.logger.info(
                    "Resolution validation passed",
                    width=width,
                    height=height
                )
        
        except subprocess.CalledProcessError as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                category="resolution",
                message=f"Failed to probe video resolution: {e.stderr}",
                details={"error": str(e)}
            ))
        except Exception as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.ERROR,
                category="resolution",
                message=f"Resolution validation error: {str(e)}",
                details={"error": str(e)}
            ))
    
    def _validate_audio_levels(self, video_path: Path, report: ValidationReport):
        """
        Validate audio levels are within acceptable range (Requirement 10.2)
        Target: -20 LUFS to -12 LUFS
        
        Args:
            video_path: Path to video file
            report: ValidationReport to update with findings
        """
        try:
            # Use ffmpeg loudnorm filter to measure LUFS
            cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-af", "loudnorm=print_format=json",
                "-f", "null",
                "-"
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                stderr=subprocess.STDOUT
            )
            
            # Parse LUFS from output (it's in stderr)
            output = result.stdout
            
            # Extract JSON from output
            json_start = output.rfind("{")
            json_end = output.rfind("}") + 1
            
            if json_start == -1 or json_end == 0:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="audio",
                    message="Could not measure audio loudness",
                    details={"reason": "No JSON output from ffmpeg"}
                ))
                return
            
            loudness_data = json.loads(output[json_start:json_end])
            input_i = float(loudness_data.get("input_i", 0))
            input_lra = float(loudness_data.get("input_lra", 0))
            input_tp = float(loudness_data.get("input_tp", 0))
            
            report.metadata["audio"] = {
                "integrated_loudness": input_i,
                "loudness_range": input_lra,
                "true_peak": input_tp
            }
            
            # Validate LUFS range: -20 to -12 LUFS
            min_lufs = -20.0
            max_lufs = -12.0
            
            if input_i < min_lufs:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="audio",
                    message=f"Audio too quiet: {input_i:.1f} LUFS (minimum: {min_lufs} LUFS)",
                    details={
                        "measured_lufs": input_i,
                        "min_lufs": min_lufs,
                        "max_lufs": max_lufs
                    }
                ))
            elif input_i > max_lufs:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="audio",
                    message=f"Audio too loud: {input_i:.1f} LUFS (maximum: {max_lufs} LUFS)",
                    details={
                        "measured_lufs": input_i,
                        "min_lufs": min_lufs,
                        "max_lufs": max_lufs
                    }
                ))
            else:
                self.logger.info(
                    "Audio level validation passed",
                    lufs=input_i,
                    range=input_lra
                )
            
            # Check for clipping (true peak > -1 dBFS)
            if input_tp > -1.0:
                report.add_issue(ValidationIssue(
                    severity=ValidationSeverity.ERROR,
                    category="audio",
                    message=f"Audio clipping detected: {input_tp:.1f} dBFS (maximum: -1.0 dBFS)",
                    details={"true_peak": input_tp}
                ))
        
        except json.JSONDecodeError as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="audio",
                message=f"Failed to parse audio measurement: {str(e)}",
                details={"error": str(e)}
            ))
        except Exception as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="audio",
                message=f"Audio validation error: {str(e)}",
                details={"error": str(e)}
            ))
    
    def _validate_subtitle_sync(self, video_path: Path, report: ValidationReport):
        """
        Validate subtitle synchronization accuracy (Requirement 10.4)
        Maximum acceptable drift: 100ms
        
        Args:
            video_path: Path to video file
            report: ValidationReport to update with findings
        """
        try:
            # Check if video has embedded subtitles
            cmd = [
                "ffprobe",
                "-v", "error",
                "-select_streams", "s",
                "-show_entries", "stream=index,codec_name",
                "-of", "json",
                str(video_path)
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            
            data = json.loads(result.stdout)
            subtitle_streams = data.get("streams", [])
            
            if not subtitle_streams:
                # Check for external .srt file
                srt_path = video_path.with_suffix(".srt")
                if srt_path.exists():
                    report.metadata["subtitles"] = {
                        "type": "external",
                        "path": str(srt_path)
                    }
                    self._validate_srt_timing(srt_path, report)
                else:
                    report.add_issue(ValidationIssue(
                        severity=ValidationSeverity.WARNING,
                        category="subtitle",
                        message="No subtitles found (embedded or external)",
                        details={"video_path": str(video_path)}
                    ))
                return
            
            report.metadata["subtitles"] = {
                "type": "embedded",
                "streams": len(subtitle_streams)
            }
            
            # For embedded subtitles, we can't easily validate sync without reference
            # This is a placeholder for more advanced validation
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.INFO,
                category="subtitle",
                message=f"Found {len(subtitle_streams)} embedded subtitle stream(s)",
                details={"streams": len(subtitle_streams)}
            ))
            
            self.logger.info(
                "Subtitle validation completed",
                streams=len(subtitle_streams)
            )
        
        except subprocess.CalledProcessError as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="subtitle",
                message=f"Failed to probe subtitles: {e.stderr}",
                details={"error": str(e)}
            ))
        except Exception as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="subtitle",
                message=f"Subtitle validation error: {str(e)}",
                details={"error": str(e)}
            ))
    
    def _validate_srt_timing(self, srt_path: Path, report: ValidationReport):
        """
        Validate SRT file timing consistency
        
        Args:
            srt_path: Path to .srt subtitle file
            report: ValidationReport to update with findings
        """
        try:
            with open(srt_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Simple validation: check for timing overlaps or gaps > 100ms
            lines = content.split('\n')
            timings = []
            
            for line in lines:
                if '-->' in line:
                    parts = line.split('-->')
                    if len(parts) == 2:
                        start = self._parse_srt_time(parts[0].strip())
                        end = self._parse_srt_time(parts[1].strip())
                        if start is not None and end is not None:
                            timings.append((start, end))
            
            # Check for overlaps and gaps
            max_gap_ms = 100  # 100ms threshold
            issues_found = 0
            
            for i in range(len(timings) - 1):
                current_end = timings[i][1]
                next_start = timings[i + 1][0]
                
                gap_ms = next_start - current_end
                
                if gap_ms < 0:
                    # Overlap detected
                    issues_found += 1
                    if issues_found <= 3:  # Report first 3 issues only
                        report.add_issue(ValidationIssue(
                            severity=ValidationSeverity.WARNING,
                            category="subtitle",
                            message=f"Subtitle timing overlap at index {i}",
                            details={
                                "subtitle_index": i,
                                "overlap_ms": abs(gap_ms)
                            }
                        ))
                elif gap_ms > max_gap_ms:
                    # Large gap detected
                    issues_found += 1
                    if issues_found <= 3:  # Report first 3 issues only
                        report.add_issue(ValidationIssue(
                            severity=ValidationSeverity.INFO,
                            category="subtitle",
                            message=f"Large subtitle gap at index {i}: {gap_ms}ms",
                            details={
                                "subtitle_index": i,
                                "gap_ms": gap_ms
                            }
                        ))
            
            if issues_found == 0:
                self.logger.info(
                    "SRT timing validation passed",
                    subtitles_count=len(timings)
                )
        
        except Exception as e:
            report.add_issue(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="subtitle",
                message=f"SRT timing validation error: {str(e)}",
                details={"error": str(e)}
            ))
    
    def _parse_srt_time(self, time_str: str) -> Optional[float]:
        """
        Parse SRT timestamp to milliseconds
        
        Args:
            time_str: Timestamp string (e.g., "00:00:01,500")
        
        Returns:
            Timestamp in milliseconds, or None if parsing fails
        """
        try:
            # Format: HH:MM:SS,mmm
            time_str = time_str.replace(',', '.')
            parts = time_str.split(':')
            
            if len(parts) != 3:
                return None
            
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = float(parts[2])
            
            total_ms = (hours * 3600 + minutes * 60 + seconds) * 1000
            return total_ms
        
        except:
            return None
    
    def validate_and_save(
        self,
        video_path: Path,
        output_path: Optional[Path] = None,
        **kwargs
    ) -> Tuple[ValidationReport, Path]:
        """
        Validate video and save report to file
        
        Args:
            video_path: Path to video file
            output_path: Path for validation report (auto-generated if None)
            **kwargs: Additional arguments passed to validate_video
        
        Returns:
            Tuple of (ValidationReport, report_path)
        """
        report = self.validate_video(video_path, **kwargs)
        
        if output_path is None:
            report_name = f"validation_{video_path.stem}.json"
            output_path = self.cache_dir / report_name
        
        report.save(output_path)
        
        self.logger.info(
            "Validation report saved",
            report_path=str(output_path),
            passed=report.passed
        )
        
        return report, output_path
