from __future__ import annotations

import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .deps import job_store
from .routers import env as env_router
from .routers import edge_tts as edge_tts_router
from .routers import files as files_router
from .routers import llm as llm_router
from .routers import media as media_router
from .routers import system as system_router
from .routers import text_to_video as text_to_video_router
from .routers import tools as tools_router
from .routers import aenv_profile_router_api as aenv_profile_router
from .routers import stt as stt_router
from .routers import translation as translation_router
from .routers import remove_overlay as remove_overlay_router
from .routers import image_finder as image_finder_router
from .routers import sources as image_sources_router
from .routers import upscale_image as upscale_image_router
from .routers import get_news_web_content as news_scraper_router
from .services.remove_overlay import (
    cleanup_results,
    cleanup_video_results,
    cleanup_overlay_results,
    cleanup_video_overlay_results,
)
from .services.text_to_video import cleanup_text_to_video_state


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()
        cleanup_results()
        cleanup_video_results()
        cleanup_overlay_results()
        cleanup_video_overlay_results()
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

    # Core routers
    app.include_router(system_router.router)
    app.include_router(media_router.router)
    app.include_router(text_to_video_router.router)
    app.include_router(files_router.router)
    app.include_router(llm_router.router)
    app.include_router(tools_router.router)
    app.include_router(env_router.router)
    app.include_router(aenv_profile_router.router)
    app.include_router(edge_tts_router.router)

    # Feature action routes (canonical)
    app.include_router(stt_router.router, prefix="/api/v1/whisper")
    app.include_router(remove_overlay_router.router, prefix="/api/v1/bg-remove-overlay")
    app.include_router(translation_router.router, prefix="/api/v1/translation")
    app.include_router(image_finder_router.router, prefix="/api/v1/image-search")
    app.include_router(image_sources_router.router, prefix="/api/v1/image-search")
    app.include_router(upscale_image_router.router, prefix="/api/v1/image/upscale")
    app.include_router(news_scraper_router.router)

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
