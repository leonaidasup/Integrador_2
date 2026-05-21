from __future__ import annotations

import logging
import json
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Depends
from pathlib import Path

from app.schemas.registry import (
    ModelListResponse,
    ModelRegistryResponse,
)
from app.services.registry import get_model_registry, RegistryError
from app.core.supabase_client import get_supabase_client
from app.services.model_manager import ModelLoadError
from app.services.model_service import get_model_service
from app.api.routes.auth import get_current_user, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["registry"], prefix="/registry")


def _parse_classes_field(value: str | None) -> list[str]:
    if not value or not value.strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        parsed = value
    if isinstance(parsed, str):
        return [item.strip() for item in parsed.split(",") if item.strip()]
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    raise ValueError("classes must be a JSON array or comma-separated string")


def _parse_config_field(value: str | None) -> dict:
    if not value or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"config must be valid JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("config must be a JSON object")
    return parsed


def get_registry(current_user: UserResponse = Depends(get_current_user)):
    try:
        supabase = get_supabase_client()
        return get_model_registry(supabase, user_id=current_user.id)
    except RegistryError as exc:
        raise HTTPException(status_code=503, detail=f"Model registry unavailable: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Model registry unavailable: {exc}") from exc


@router.post("/models/upload", response_model=ModelRegistryResponse)
async def upload_model(
    name: str = Form(...),
    version: str = Form(...),
    file: UploadFile = File(...),
    description: str | None = Form(None),
    framework: str = Form("keras"),
    architecture: str | None = Form(None),
    encoder: str | None = Form(None),
    input_size: int | None = Form(None),
    artifact_type: str = Form("full_model"),
    classes: str = Form("[]"),
    config: str = Form("{}"),
    registry=Depends(get_registry),
    current_user: UserResponse = Depends(get_current_user),
) -> ModelRegistryResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing model filename.")

    ext = Path(file.filename).suffix.lower()
    if ext not in {".h5", ".keras", ".pth", ".pt", ".pkl", ".joblib"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid model type. Allowed: .h5, .keras, .pth, .pt, .pkl, .joblib.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded model is empty.")

    try:
        parsed_classes = _parse_classes_field(classes)
        parsed_config = _parse_config_field(config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata: {exc}") from exc

    # Merge encoder and input_size into config so model_manager can use them
    if encoder:
        parsed_config["encoder"] = encoder
    if input_size:
        parsed_config["input_size"] = input_size

    try:
        model = registry.register_model(
            name=name,
            version=version,
            artifact_data=data,
            filename=file.filename,
            framework=framework,
            architecture=architecture,
            artifact_type=artifact_type,
            classes=parsed_classes,
            config=parsed_config,
            description=description,
            uploaded_by=current_user.id,
        )
        return model
    except RegistryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register model: {e}") from e


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    registry=Depends(get_registry),
    current_user: UserResponse = Depends(get_current_user),
) -> ModelListResponse:
    try:
        return registry.list_models()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list models: {e}") from e


@router.get("/models/active", response_model=ModelRegistryResponse)
async def get_active_model(
    registry=Depends(get_registry),
    current_user: UserResponse = Depends(get_current_user),
) -> ModelRegistryResponse:
    try:
        active_model = registry.get_active_model()
        if not active_model:
            raise HTTPException(status_code=503, detail="No active model.")
        return active_model
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get active model: {e}") from e


@router.post("/models/{model_id}/activate", response_model=ModelRegistryResponse)
async def activate_model(
    model_id: str,
    registry=Depends(get_registry),
    current_user: UserResponse = Depends(get_current_user),
) -> ModelRegistryResponse:
    try:
        # Ownership check
        model = registry.get_model(model_id)
        if model.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="You don't own this model.")

        svc = get_model_service()
        svc._registry = registry
        loaded = svc.load_registry_model(model_id)
        if not loaded:
            raise HTTPException(status_code=500, detail="Model failed to load into service.")

        activated = registry.activate_model(model_id)
        return activated
    except RegistryError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ModelLoadError as e:
        logger.exception("Model %s could not be loaded.", model_id)
        try:
            registry.record_activation_failure(model_id, str(e))
        except RegistryError:
            pass
        raise HTTPException(status_code=500, detail=f"Model activation failed: {e}") from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to activate model: {e}") from e


@router.delete("/models/{model_id}")
async def delete_model(
    model_id: str,
    registry=Depends(get_registry),
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    try:
        model = registry.get_model(model_id)
        if model.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="You don't own this model.")
        registry.delete_model(model_id)
        return {"status": "deleted", "model_id": model_id}
    except RegistryError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {e}") from e