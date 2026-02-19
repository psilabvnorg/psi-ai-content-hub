from __future__ import annotations

import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import job_store
from .routers import env as env_router
from .routers import system as system_router
from .routers import translation as translation_router


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()


def create_app() -> FastAPI:
    app = FastAPI(title="Translation Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router.router)
    app.include_router(env_router.router)
    app.include_router(translation_router.router)

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
