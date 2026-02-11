from __future__ import annotations

import os
import sys
import uvicorn

from .app import app


def main() -> None:
    # Set UTF-8 encoding for Windows console
    if sys.platform == "win32":
        os.environ["PYTHONIOENCODING"] = "utf-8"
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8')
    
    uvicorn.run(app, host="127.0.0.1", port=6902, log_level="info")


if __name__ == "__main__":
    main()
