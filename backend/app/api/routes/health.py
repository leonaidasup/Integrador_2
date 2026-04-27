from __future__ import annotations

from fastapi import APIRouter

from app.schemas.model import HealthResponse
from app.services.model_service import get_model_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    service = get_model_service()
    status = service.status()
    return HealthResponse(
        status="ok",
        device=str(service.device),
        model_loaded=status["loaded"],
        model_framework=status["framework"],
        classes=service.class_names,
    )
