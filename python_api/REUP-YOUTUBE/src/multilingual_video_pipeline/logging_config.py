"""
Structured logging configuration for the multilingual video pipeline.
"""

import sys
import logging
from pathlib import Path
from typing import Any, Dict
import structlog
from structlog.stdlib import LoggerFactory

from .config import settings


def setup_logging() -> None:
    """Configure structured logging for the application."""
    
    # Ensure logs directory exists
    settings.logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if settings.log_format == "json" 
            else structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level.upper()),
    )
    
    # Add file handler for persistent logging
    file_handler = logging.FileHandler(
        settings.logs_dir / "pipeline.log",
        encoding="utf-8"
    )
    file_handler.setLevel(logging.INFO)
    
    # Add error file handler
    error_handler = logging.FileHandler(
        settings.logs_dir / "errors.log",
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    
    # Get root logger and add handlers
    root_logger = logging.getLogger()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(error_handler)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)


class LoggerMixin:
    """Mixin class to add logging capabilities to other classes."""
    
    @property
    def logger(self) -> structlog.stdlib.BoundLogger:
        """Get a logger instance for this class."""
        return get_logger(self.__class__.__name__)


# Setup logging on import
setup_logging()