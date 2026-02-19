from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import env as env_router
from .routers import image_finder as image_finder_router
from .routers import llm as llm_router
from .routers import system as system_router


def create_app() -> FastAPI:
    app = FastAPI(title="Image Finder Service", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "file://",
            "null",
            "*",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router.router)
    app.include_router(env_router.router)
    app.include_router(llm_router.router)
    app.include_router(image_finder_router.router)
    return app


app = create_app()

