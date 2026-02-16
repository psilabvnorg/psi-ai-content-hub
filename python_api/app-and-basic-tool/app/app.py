from __future__ import annotations

import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import job_store
from .routers import env as env_router
from .routers import files as files_router
from .routers import media as media_router
from .routers import system as system_router
from .routers import text_to_video as text_to_video_router
from .routers import tools as tools_router
from .services.text_to_video import cleanup_text_to_video_state


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()
        cleanup_text_to_video_state()


def create_app() -> FastAPI:
    app = FastAPI(title="PSI App Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "file://",
            "null",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router.router)
    app.include_router(media_router.router)
    app.include_router(text_to_video_router.router)
    app.include_router(files_router.router)
    app.include_router(tools_router.router)
    app.include_router(env_router.router)

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
