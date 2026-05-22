from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Optional

from PIL import Image as PILImage
import numpy as np

from app.core.supabase_client import get_supabase_client

IMAGES_BUCKET = "images"
MASKS_BUCKET  = "masks"


def _client():
    return get_supabase_client().storage


def upload_image(
    data: bytes,
    filename: str,
    user_id: str,
    dataset_id: str,
    image_id: str,
) -> str:
    """Upload original image to Storage. Returns storage_path."""
    ext = Path(filename).suffix.lower() or ".png"
    path = f"{user_id}/{dataset_id}/{image_id}{ext}"
    _client().from_(IMAGES_BUCKET).upload(path, data, {"content-type": _content_type(ext)})
    return path


def upload_mask(mask: np.ndarray, user_id: str, segmentation_id: str) -> str:
    """Upload uint8 class mask as PNG. Returns storage_path."""
    buf = io.BytesIO()
    PILImage.fromarray(mask.astype(np.uint8), mode="L").save(buf, format="PNG")
    path = f"{user_id}/{segmentation_id}_mask.png"
    _client().from_(MASKS_BUCKET).upload(path, buf.getvalue(), {"content-type": "image/png"})
    return path


def get_image_url(storage_path: str) -> str:
    return _client().from_(IMAGES_BUCKET).get_public_url(storage_path)


def get_mask_url(storage_path: str) -> str:
    return _client().from_(MASKS_BUCKET).get_public_url(storage_path)


def download_image(storage_path: str) -> bytes:
    return _client().from_(IMAGES_BUCKET).download(storage_path)


def download_mask(storage_path: str) -> np.ndarray:
    data = _client().from_(MASKS_BUCKET).download(storage_path)
    img = PILImage.open(io.BytesIO(data)).convert("L")
    return np.array(img, dtype=np.uint8)


def delete_image(storage_path: str) -> None:
    _client().from_(IMAGES_BUCKET).remove([storage_path])


def delete_mask(storage_path: str) -> None:
    _client().from_(MASKS_BUCKET).remove([storage_path])


def _content_type(ext: str) -> str:
    return {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "tiff": "image/tiff", "tif": "image/tiff"}.get(ext.lstrip("."), "application/octet-stream")