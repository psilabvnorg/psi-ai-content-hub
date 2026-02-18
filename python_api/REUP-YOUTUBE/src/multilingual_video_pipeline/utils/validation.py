"""
Validation utility functions for the multilingual video pipeline.
"""

import re
from pathlib import Path
from typing import List, Union
from urllib.parse import urlparse
import mimetypes

from ..logging_config import get_logger

logger = get_logger(__name__)


def validate_url(url: str) -> bool:
    """
    Validate if a string is a valid URL.
    
    Args:
        url: URL string to validate
        
    Returns:
        True if valid URL, False otherwise
    """
    try:
        result = urlparse(url)
        is_valid = all([result.scheme, result.netloc])
        logger.debug("URL validation", url=url, valid=is_valid)
        return is_valid
    except Exception as e:
        logger.debug("URL validation failed", url=url, error=str(e))
        return False


def validate_youtube_url(url: str) -> bool:
    """
    Validate if a URL is a valid YouTube URL.
    
    Args:
        url: URL string to validate
        
    Returns:
        True if valid YouTube URL, False otherwise
    """
    youtube_patterns = [
        r'https?://(?:www\.)?youtube\.com/watch\?v=[\w-]+',
        r'https?://(?:www\.)?youtube\.com/channel/[\w-]+',
        r'https?://(?:www\.)?youtube\.com/@[\w-]+',
        r'https?://youtu\.be/[\w-]+',
    ]
    
    for pattern in youtube_patterns:
        if re.match(pattern, url):
            logger.debug("YouTube URL validation", url=url, valid=True)
            return True
    
    logger.debug("YouTube URL validation", url=url, valid=False)
    return False


def validate_video_file(file_path: Union[str, Path]) -> bool:
    """
    Validate if a file is a valid video file.
    
    Args:
        file_path: Path to the video file
        
    Returns:
        True if valid video file, False otherwise
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        logger.debug("Video file validation failed", file=str(file_path), reason="file_not_found")
        return False
    
    # Check file extension
    video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'}
    if file_path.suffix.lower() not in video_extensions:
        logger.debug("Video file validation failed", file=str(file_path), reason="invalid_extension")
        return False
    
    # Check MIME type
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type and not mime_type.startswith('video/'):
        logger.debug("Video file validation failed", file=str(file_path), reason="invalid_mime_type")
        return False
    
    # Check file size (must be > 0)
    if file_path.stat().st_size == 0:
        logger.debug("Video file validation failed", file=str(file_path), reason="empty_file")
        return False
    
    logger.debug("Video file validation", file=str(file_path), valid=True)
    return True


def validate_audio_file(file_path: Union[str, Path]) -> bool:
    """
    Validate if a file is a valid audio file.
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        True if valid audio file, False otherwise
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        logger.debug("Audio file validation failed", file=str(file_path), reason="file_not_found")
        return False
    
    # Check file extension
    audio_extensions = {'.wav', '.mp3', '.aac', '.flac', '.ogg', '.m4a', '.wma'}
    if file_path.suffix.lower() not in audio_extensions:
        logger.debug("Audio file validation failed", file=str(file_path), reason="invalid_extension")
        return False
    
    # Check MIME type
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type and not mime_type.startswith('audio/'):
        logger.debug("Audio file validation failed", file=str(file_path), reason="invalid_mime_type")
        return False
    
    # Check file size (must be > 0)
    if file_path.stat().st_size == 0:
        logger.debug("Audio file validation failed", file=str(file_path), reason="empty_file")
        return False
    
    logger.debug("Audio file validation", file=str(file_path), valid=True)
    return True


def validate_image_file(file_path: Union[str, Path]) -> bool:
    """
    Validate if a file is a valid image file.
    
    Args:
        file_path: Path to the image file
        
    Returns:
        True if valid image file, False otherwise
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        logger.debug("Image file validation failed", file=str(file_path), reason="file_not_found")
        return False
    
    # Check file extension
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'}
    if file_path.suffix.lower() not in image_extensions:
        logger.debug("Image file validation failed", file=str(file_path), reason="invalid_extension")
        return False
    
    # Check MIME type
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if mime_type and not mime_type.startswith('image/'):
        logger.debug("Image file validation failed", file=str(file_path), reason="invalid_mime_type")
        return False
    
    # Check file size (must be > 0)
    if file_path.stat().st_size == 0:
        logger.debug("Image file validation failed", file=str(file_path), reason="empty_file")
        return False
    
    logger.debug("Image file validation", file=str(file_path), valid=True)
    return True


def validate_language_code(lang_code: str) -> bool:
    """
    Validate if a string is a valid language code.
    
    Args:
        lang_code: Language code to validate
        
    Returns:
        True if valid language code, False otherwise
    """
    # Support both ISO 639-1 (2-letter) and ISO 639-2 (3-letter) codes
    valid_codes = {
        'vi', 'vie',  # Vietnamese
        'ja', 'jpn',  # Japanese
        'de', 'deu', 'ger',  # German
        'en', 'eng',  # English
        'zh', 'chi', 'zho',  # Chinese
        'fr', 'fra', 'fre',  # French
        'es', 'spa',  # Spanish
        'ko', 'kor',  # Korean
        'th', 'tha',  # Thai
        'id', 'ind',  # Indonesian
    }
    
    is_valid = lang_code.lower() in valid_codes
    logger.debug("Language code validation", code=lang_code, valid=is_valid)
    return is_valid


def validate_resolution(width: int, height: int) -> bool:
    """
    Validate if resolution values are reasonable.
    
    Args:
        width: Video width in pixels
        height: Video height in pixels
        
    Returns:
        True if valid resolution, False otherwise
    """
    # Check for positive values
    if width <= 0 or height <= 0:
        logger.debug("Resolution validation failed", width=width, height=height, reason="non_positive")
        return False
    
    # Check for reasonable bounds (not too small or too large)
    min_dimension = 240  # Minimum reasonable dimension
    max_dimension = 7680  # 8K resolution
    
    if width < min_dimension or height < min_dimension:
        logger.debug("Resolution validation failed", width=width, height=height, reason="too_small")
        return False
    
    if width > max_dimension or height > max_dimension:
        logger.debug("Resolution validation failed", width=width, height=height, reason="too_large")
        return False
    
    logger.debug("Resolution validation", width=width, height=height, valid=True)
    return True


def validate_aspect_ratio(width: int, height: int, expected_ratio: str) -> bool:
    """
    Validate if resolution matches expected aspect ratio.
    
    Args:
        width: Video width in pixels
        height: Video height in pixels
        expected_ratio: Expected aspect ratio (e.g., "16:9", "9:16")
        
    Returns:
        True if aspect ratio matches, False otherwise
    """
    if ':' not in expected_ratio:
        logger.debug("Aspect ratio validation failed", ratio=expected_ratio, reason="invalid_format")
        return False
    
    try:
        ratio_w, ratio_h = map(int, expected_ratio.split(':'))
        expected_decimal = ratio_w / ratio_h
        actual_decimal = width / height
        
        # Allow small tolerance for floating point comparison
        tolerance = 0.01
        matches = abs(expected_decimal - actual_decimal) < tolerance
        
        logger.debug("Aspect ratio validation", 
                    width=width, height=height, 
                    expected=expected_ratio, 
                    expected_decimal=expected_decimal,
                    actual_decimal=actual_decimal,
                    matches=matches)
        
        return matches
        
    except (ValueError, ZeroDivisionError) as e:
        logger.debug("Aspect ratio validation failed", 
                    width=width, height=height, 
                    expected=expected_ratio, 
                    error=str(e))
        return False