from __future__ import annotations

import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import job_store
from .routers import background_removal as bg_router
from .routers import env as env_router
from .routers import files as files_router
from .routers import system as system_router
from .services import background_removal


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()
        background_removal.cleanup_results()


def create_app() -> FastAPI:
    app = FastAPI(title="Background Removal Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router.router)
    app.include_router(env_router.router)
    app.include_router(bg_router.router)
    app.include_router(files_router.router)

    @app.on_event("startup")
    def startup_preload_model() -> None:
        background_removal.start_model_preload()

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
