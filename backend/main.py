from __future__ import annotations

import base64
import io
from pathlib import Path

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from model import CLASS_NAMES, colorize_mask, load_model, predict

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
}

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR.parent / "models" / "model.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL = load_model(MODEL_PATH, DEVICE)

app = FastAPI(title="Image Segmentation API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _pil_to_base64_png(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "device": str(DEVICE),
        "model_loaded": MODEL is not None,
        "classes": CLASS_NAMES,
    }


@app.post("/segment")
async def segment(file: UploadFile = File(...)) -> dict:
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

    mask = predict(image=image, model=MODEL, device=DEVICE)
    mask_image = Image.fromarray(mask, mode="L")
    segmented_image = colorize_mask(mask)

    return {
        "filename": file.filename,
        "classes": CLASS_NAMES,
        "mask_base64": _pil_to_base64_png(mask_image),
        "segmented_base64": _pil_to_base64_png(segmented_image),
        "model_loaded": MODEL is not None,
    }
