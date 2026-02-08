from __future__ import annotations

import threading
import time
from typing import Generator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import job_store
from .routers import system as system_router
from .routers import tools as tools_router
from .routers import workflows as workflows_router
from .settings import CORS_ALLOW_ORIGINS


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()


def create_app() -> FastAPI:
    app = FastAPI(title="Unified Backend", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOW_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router.router)
    app.include_router(system_router.download_router)
    app.include_router(tools_router.router)
    app.include_router(workflows_router.router)

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
