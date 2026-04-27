from __future__ import annotations

import base64
import io
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.schemas.model import LoadModelResponse, SegmentResponse
from app.services.model_manager import ModelLoadError, ModelPredictError
from app.services.model_service import get_model_service

router = APIRouter(tags=["model"])

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
}


def _pil_to_base64_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


@router.post("/load_model", response_model=LoadModelResponse)
async def load_model_endpoint(file: UploadFile = File(...)) -> LoadModelResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing model filename.")

    ext = Path(file.filename).suffix.lower()
    if ext not in {".pth", ".keras"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid model type. Allowed: .pth (PyTorch), .keras (Keras).",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded model is empty.")

    service = get_model_service()
    try:
        framework = service.load_from_upload(data=data, filename=file.filename)
    except ModelLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    status = service.status()
    return LoadModelResponse(
        status="loaded",
        filename=file.filename,
        framework=framework,
        model_loaded=status["loaded"],
    )


@router.post("/segment", response_model=SegmentResponse)
async def segment(file: UploadFile = File(...)) -> SegmentResponse:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: PNG, JPG/JPEG, TIFF.",
        )

    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="File is not a valid image.") from exc

    service = get_model_service()
    try:
        mask = service.predict_mask(image=image)
    except ModelPredictError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    mask_image = Image.fromarray(mask, mode="L")
    segmented_image = service.colorize_mask(mask)

    return SegmentResponse(
        filename=file.filename,
        classes=service.class_names,
        mask_base64=_pil_to_base64_png(mask_image),
        segmented_base64=_pil_to_base64_png(segmented_image),
        model_loaded=service.status()["loaded"],
    )
