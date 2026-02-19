"""
Time utility functions for the multilingual video pipeline.
"""

import re
from datetime import datetime, timedelta
from typing import Union


def format_duration(seconds: float) -> str:
    """
    Format duration in seconds to HH:MM:SS.mmm format.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Formatted duration string
    """
    if seconds < 0:
        raise ValueError("Duration cannot be negative")
    
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def parse_duration(duration_str: str) -> float:
    """
    Parse duration string to seconds.
    
    Supports formats:
    - HH:MM:SS.mmm
    - MM:SS.mmm
    - SS.mmm
    - SS
    
    Args:
        duration_str: Duration string to parse
        
    Returns:
        Duration in seconds
    """
    duration_str = duration_str.strip()
    
    # Pattern for HH:MM:SS.mmm format
    pattern = r'^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$'
    match = re.match(pattern, duration_str)
    
    if not match:
        raise ValueError(f"Invalid duration format: {duration_str}")
    
    hours_str, minutes_str, seconds_str = match.groups()
    
    hours = int(hours_str) if hours_str else 0
    minutes = int(minutes_str) if minutes_str else 0
    seconds = float(seconds_str)
    
    total_seconds = hours * 3600 + minutes * 60 + seconds
    
    return total_seconds


def get_timestamp() -> str:
    """
    Get current timestamp in ISO format.
    
    Returns:
        ISO formatted timestamp string
    """
    return datetime.now().isoformat()


def seconds_to_timedelta(seconds: float) -> timedelta:
    """
    Convert seconds to timedelta object.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        timedelta object
    """
    return timedelta(seconds=seconds)


def timedelta_to_seconds(td: timedelta) -> float:
    """
    Convert timedelta to seconds.
    
    Args:
        td: timedelta object
        
    Returns:
        Duration in seconds
    """
    return td.total_seconds()


def format_timestamp(dt: datetime, format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    Format datetime object to string.
    
    Args:
        dt: datetime object
        format_str: Format string
        
    Returns:
        Formatted datetime string
    """
    return dt.strftime(format_str)


def parse_timestamp(timestamp_str: str, format_str: str = "%Y-%m-%d %H:%M:%S") -> datetime:
    """
    Parse timestamp string to datetime object.
    
    Args:
        timestamp_str: Timestamp string
        format_str: Format string
        
    Returns:
        datetime object
    """
    return datetime.strptime(timestamp_str, format_str)


def time_range_overlap(start1: float, end1: float, start2: float, end2: float) -> bool:
    """
    Check if two time ranges overlap.
    
    Args:
        start1: Start time of first range
        end1: End time of first range
        start2: Start time of second range
        end2: End time of second range
        
    Returns:
        True if ranges overlap, False otherwise
    """
    return max(start1, start2) < min(end1, end2)


def calculate_overlap_duration(start1: float, end1: float, start2: float, end2: float) -> float:
    """
    Calculate overlap duration between two time ranges.
    
    Args:
        start1: Start time of first range
        end1: End time of first range
        start2: Start time of second range
        end2: End time of second range
        
    Returns:
        Overlap duration in seconds (0 if no overlap)
    """
    if not time_range_overlap(start1, end1, start2, end2):
        return 0.0
    
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    
    return overlap_end - overlap_start