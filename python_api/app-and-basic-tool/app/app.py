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
from .routers import reup_youtube as reup_youtube_router
from .bg_remove_overlay.routers import env as bg_remove_overlay_env_router
from .bg_remove_overlay.routers import files as bg_remove_overlay_files_router
from .bg_remove_overlay.routers import remove_overlay as bg_remove_overlay_router
from .bg_remove_overlay.routers import system as bg_remove_overlay_system_router
from .bg_remove_overlay.services import remove_overlay as bg_remove_overlay_service
from .image_search.routers import config as image_search_config_router
from .image_search.routers import env as image_search_env_router
from .image_search.routers import image_finder as image_search_router
from .image_search.routers import llm as image_search_llm_router
from .image_search.routers import sources as image_search_sources_router
from .image_search.routers import system as image_search_system_router
from .translation.routers import env as translation_env_router
from .translation.routers import system as translation_system_router
from .translation.routers import translation as translation_router
from .whisper.routers import env as whisper_env_router
from .whisper.routers import stt as whisper_stt_router
from .whisper.routers import system as whisper_system_router
from .services.text_to_video import cleanup_text_to_video_state


def _cleanup_loop() -> None:
    while True:
        time.sleep(60)
        job_store.cleanup()
        bg_remove_overlay_service.cleanup_results()
        bg_remove_overlay_service.cleanup_video_results()
        bg_remove_overlay_service.cleanup_overlay_results()
        bg_remove_overlay_service.cleanup_video_overlay_results()
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
    app.include_router(llm_router.router)
    app.include_router(tools_router.router)
    app.include_router(env_router.router)
    app.include_router(aenv_profile_router.router)
    app.include_router(edge_tts_router.router)
    app.include_router(reup_youtube_router.router)

    # Canonical feature routes
    app.include_router(whisper_system_router.router, prefix="/api/v1/whisper")
    app.include_router(whisper_env_router.router, prefix="/api/v1/whisper")
    app.include_router(whisper_stt_router.router, prefix="/api/v1/whisper")

    app.include_router(bg_remove_overlay_system_router.router, prefix="/api/v1/bg-remove-overlay")
    app.include_router(bg_remove_overlay_env_router.router, prefix="/api/v1/bg-remove-overlay")
    app.include_router(bg_remove_overlay_router.router, prefix="/api/v1/bg-remove-overlay")
    app.include_router(bg_remove_overlay_files_router.router, prefix="/api/v1/bg-remove-overlay")

    app.include_router(translation_system_router.router, prefix="/api/v1/translation/system")
    app.include_router(translation_env_router.router, prefix="/api/v1/translation")
    app.include_router(translation_router.router, prefix="/api/v1/translation")

    app.include_router(image_search_system_router.router, prefix="/api/v1/image-search")
    app.include_router(image_search_config_router.router, prefix="/api/v1/image-search")
    app.include_router(image_search_env_router.router, prefix="/api/v1/image-search")
    app.include_router(image_search_llm_router.router, prefix="/api/v1/image-search")
    app.include_router(image_search_router.router, prefix="/api/v1/image-search")
    app.include_router(image_search_sources_router.router, prefix="/api/v1/image-search")

    # Legacy compatibility routes (to keep existing clients working during migration)
    app.include_router(whisper_system_router.router, prefix="/whisper/api/v1")
    app.include_router(whisper_env_router.router, prefix="/whisper/api/v1")
    app.include_router(whisper_stt_router.router, prefix="/whisper/api/v1")

    app.include_router(bg_remove_overlay_system_router.router, prefix="/bg-remove-overlay/api/v1")
    app.include_router(bg_remove_overlay_env_router.router, prefix="/bg-remove-overlay/api/v1")
    app.include_router(bg_remove_overlay_router.router, prefix="/bg-remove-overlay/api/v1")
    app.include_router(bg_remove_overlay_files_router.router, prefix="/bg-remove-overlay/api/v1")

    app.include_router(translation_system_router.router, prefix="/translation/api/v1")
    app.include_router(translation_env_router.router, prefix="/translation/api/v1")
    app.include_router(translation_router.router, prefix="/translation/api/v1/translation")

    app.include_router(image_search_system_router.router, prefix="/image-search/api/v1")
    app.include_router(image_search_config_router.router, prefix="/image-search/api/v1")
    app.include_router(image_search_env_router.router, prefix="/image-search/api/v1")
    app.include_router(image_search_llm_router.router, prefix="/image-search/api/v1")
    app.include_router(image_search_router.router, prefix="/image-search/api/v1")
    app.include_router(image_search_sources_router.router, prefix="/image-search/api/v1")

    threading.Thread(target=_cleanup_loop, daemon=True).start()
    return app


app = create_app()
