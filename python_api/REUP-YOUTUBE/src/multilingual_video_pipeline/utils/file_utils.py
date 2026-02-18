"""
File utility functions for the multilingual video pipeline.
"""

import hashlib
import shutil
from pathlib import Path
from typing import List, Optional, Union
import tempfile
import os

from ..logging_config import get_logger

logger = get_logger(__name__)


def ensure_directory(path: Union[str, Path]) -> Path:
    """
    Ensure a directory exists, creating it if necessary.
    
    Args:
        path: Directory path to create
        
    Returns:
        Path object for the directory
    """
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    logger.debug("Directory ensured", path=str(path))
    return path


def get_file_hash(file_path: Union[str, Path], algorithm: str = "md5") -> str:
    """
    Calculate hash of a file.
    
    Args:
        file_path: Path to the file
        algorithm: Hash algorithm to use (md5, sha1, sha256)
        
    Returns:
        Hexadecimal hash string
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    hash_obj = hashlib.new(algorithm)
    
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_obj.update(chunk)
    
    file_hash = hash_obj.hexdigest()
    logger.debug("File hash calculated", 
                file=str(file_path), 
                algorithm=algorithm, 
                hash=file_hash)
    
    return file_hash


def get_file_size(file_path: Union[str, Path]) -> int:
    """
    Get file size in bytes.
    
    Args:
        file_path: Path to the file
        
    Returns:
        File size in bytes
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    size = file_path.stat().st_size
    logger.debug("File size retrieved", file=str(file_path), size_bytes=size)
    
    return size


def cleanup_temp_files(temp_dir: Optional[Union[str, Path]] = None) -> None:
    """
    Clean up temporary files and directories.
    
    Args:
        temp_dir: Specific temporary directory to clean up.
                 If None, cleans up default temp directory.
    """
    if temp_dir is None:
        temp_dir = Path(tempfile.gettempdir()) / "multilingual_video_pipeline"
    else:
        temp_dir = Path(temp_dir)
    
    if temp_dir.exists():
        try:
            shutil.rmtree(temp_dir)
            logger.info("Temporary files cleaned up", temp_dir=str(temp_dir))
        except Exception as e:
            logger.error("Failed to clean up temporary files", 
                        temp_dir=str(temp_dir), 
                        error=str(e))


def create_temp_directory(prefix: str = "mvp_") -> Path:
    """
    Create a temporary directory for processing.
    
    Args:
        prefix: Prefix for the temporary directory name
        
    Returns:
        Path to the created temporary directory
    """
    temp_dir = Path(tempfile.mkdtemp(prefix=prefix))
    logger.debug("Temporary directory created", temp_dir=str(temp_dir))
    return temp_dir


def safe_filename(filename: str, max_length: int = 255) -> str:
    """
    Create a safe filename by removing/replacing problematic characters.
    
    Args:
        filename: Original filename
        max_length: Maximum length for the filename
        
    Returns:
        Safe filename string
    """
    # Remove or replace problematic characters
    safe_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    safe_name = "".join(c if c in safe_chars else "_" for c in filename)
    
    # Truncate if too long
    if len(safe_name) > max_length:
        name, ext = os.path.splitext(safe_name)
        safe_name = name[:max_length - len(ext)] + ext
    
    logger.debug("Filename sanitized", original=filename, safe=safe_name)
    return safe_name


def copy_file_with_progress(src: Union[str, Path], dst: Union[str, Path]) -> None:
    """
    Copy a file with progress logging.
    
    Args:
        src: Source file path
        dst: Destination file path
    """
    src = Path(src)
    dst = Path(dst)
    
    if not src.exists():
        raise FileNotFoundError(f"Source file not found: {src}")
    
    # Ensure destination directory exists
    ensure_directory(dst.parent)
    
    # Copy file
    shutil.copy2(src, dst)
    
    logger.info("File copied", 
               src=str(src), 
               dst=str(dst), 
               size_bytes=get_file_size(dst))


def move_file(src: Union[str, Path], dst: Union[str, Path]) -> None:
    """
    Move a file to a new location.
    
    Args:
        src: Source file path
        dst: Destination file path
    """
    src = Path(src)
    dst = Path(dst)
    
    if not src.exists():
        raise FileNotFoundError(f"Source file not found: {src}")
    
    # Ensure destination directory exists
    ensure_directory(dst.parent)
    
    # Move file
    shutil.move(str(src), str(dst))
    
    logger.info("File moved", src=str(src), dst=str(dst))