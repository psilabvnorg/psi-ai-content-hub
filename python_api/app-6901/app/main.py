from __future__ import annotations

import uvicorn

from .app import app
from python_api.common.paths import LOG_DIR, LOG_MAX_BYTES


_LOG_NAME = "app-service.log"


def _build_log_config() -> dict:
    """
    Build a uvicorn log_config dict that sends logs to both the terminal
    (stderr/stdout as usual) and app-service.log.

    Passing this via uvicorn.run(log_config=...) ensures our FileHandler
    is registered *after* uvicorn applies dictConfig internally, so it
    survives uvicorn's own logging setup.

    The file is deleted on startup if it is over LOG_MAX_BYTES so that
    the next session starts with a fresh file.
    """
    log_file = LOG_DIR / _LOG_NAME
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Auto-delete if over size limit before opening a new FileHandler
    if log_file.exists() and log_file.stat().st_size > LOG_MAX_BYTES:
        try:
            log_file.unlink()
        except Exception:
            pass

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(message)s",
                "use_colors": None,
            },
            "access": {
                "()": "uvicorn.logging.AccessFormatter",
                "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
            },
            "file": {
                "format": "%(asctime)s %(levelname)s %(name)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stderr",
            },
            "access": {
                "formatter": "access",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
            "file": {
                "formatter": "file",
                "class": "logging.FileHandler",
                "filename": str(log_file),
                "encoding": "utf-8",
                "mode": "a",
            },
        },
        "loggers": {
            "uvicorn": {
                "handlers": ["default", "file"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.error": {
                "handlers": ["default", "file"],
                "level": "INFO",
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["access", "file"],
                "level": "INFO",
                "propagate": False,
            },
        },
    }


def main() -> None:
    uvicorn.run(app, host="127.0.0.1", port=6901, log_level="info", log_config=_build_log_config())


if __name__ == "__main__":
    main()
