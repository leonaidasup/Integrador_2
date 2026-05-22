from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, health, model, registry, datasets

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="Image Segmentation API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(health.router)
    app.include_router(model.router)
    app.include_router(registry.router)
    app.include_router(datasets.router)

    @app.on_event("startup")
    def _load_active_model_on_startup() -> None:
        """Load the active registry model into memory when the API starts."""
        try:
            from app.core.supabase_client import get_supabase_client
            from app.services.registry import get_model_registry
            from app.services.model_service import get_model_service

            registry_service = get_model_registry(get_supabase_client())
            model_service = get_model_service()
            model_service._registry = registry_service

            active = registry_service.get_active_model()
            if not active:
                return

            model_service.load_active_model_from_registry()
            logger.info("Loaded active model '%s' on startup.", active.id)
        except Exception:
            logger.exception("Failed to auto-load active registry model on startup.")

    return app