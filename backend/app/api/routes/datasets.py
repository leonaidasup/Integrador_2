from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image as PILImage, UnidentifiedImageError

from app.api.routes.auth import UserResponse, get_current_user
from app.core.supabase_client import get_supabase_client
from app.schemas.dataset import (
    DatasetCreate,
    DatasetListResponse,
    DatasetResponse,
    ImageListResponse,
    ImageResponse,
    SegmentationResponse,
)
from app.services import storage
from app.services.model_service import get_model_service
from app.services.model_manager import ModelPredictError

router = APIRouter(prefix="/datasets", tags=["datasets"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/tiff"}


def _db():
    return get_supabase_client()


def _now() -> str:
    return datetime.utcnow().isoformat()


# ── Datasets ──────────────────────────────────────────────────────────────────

@router.post("", response_model=DatasetResponse, status_code=201)
def create_dataset(
    payload: DatasetCreate,
    current_user: UserResponse = Depends(get_current_user),
) -> DatasetResponse:
    now = _now()
    data = {
        "user_id": current_user.id,
        "name": payload.name.strip(),
        "description": payload.description,
        "tags": payload.tags,
        "version": payload.version,
        "image_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    res = _db().table("datasets").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create dataset.")
    return DatasetResponse(**res.data[0])


@router.get("", response_model=DatasetListResponse)
def list_datasets(
    current_user: UserResponse = Depends(get_current_user),
) -> DatasetListResponse:
    res = _db().table("datasets").select("*").eq("user_id", current_user.id).execute()
    datasets = [DatasetResponse(**d) for d in (res.data or [])]
    return DatasetListResponse(datasets=datasets, total=len(datasets))


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    res = _db().table("datasets").select("id,user_id").eq("id", dataset_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if res.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")
    _db().table("datasets").delete().eq("id", dataset_id).execute()
    return {"status": "deleted", "dataset_id": dataset_id}


# ── Images ────────────────────────────────────────────────────────────────────

@router.post("/{dataset_id}/images", response_model=ImageResponse, status_code=201)
async def upload_image(
    dataset_id: str,
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
) -> ImageResponse:
    # Verify dataset ownership
    ds = _db().table("datasets").select("id,user_id").eq("id", dataset_id).limit(1).execute()
    if not ds.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if ds.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image type. Allowed: PNG, JPEG, TIFF.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        img = PILImage.open(io.BytesIO(raw))
        width, height = img.size
        fmt = img.format.lower() if img.format else Path(file.filename).suffix.lstrip(".")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid image.")

    image_id = str(uuid.uuid4())
    storage_path = storage.upload_image(
        data=raw,
        filename=file.filename,
        user_id=current_user.id,
        dataset_id=dataset_id,
        image_id=image_id,
    )

    now = _now()
    record = {
        "id": image_id,
        "dataset_id": dataset_id,
        "user_id": current_user.id,
        "filename": file.filename,
        "storage_path": storage_path,
        "width": width,
        "height": height,
        "format": fmt,
        "size_bytes": len(raw),
        "created_at": now,
    }
    res = _db().table("images").insert(record).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save image record.")

    # Increment image_count
    _db().rpc("increment_image_count", {"ds_id": dataset_id}).execute()

    return ImageResponse(**res.data[0])


@router.get("/{dataset_id}/images", response_model=ImageListResponse)
def list_images(
    dataset_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> ImageListResponse:
    ds = _db().table("datasets").select("id,user_id").eq("id", dataset_id).limit(1).execute()
    if not ds.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if ds.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")

    res = _db().table("images").select("*").eq("dataset_id", dataset_id).execute()
    images = [ImageResponse(**i) for i in (res.data or [])]
    return ImageListResponse(images=images, total=len(images))


# ── Segmentations ─────────────────────────────────────────────────────────────

@router.post("/{dataset_id}/images/{image_id}/segment", response_model=SegmentationResponse, status_code=201)
def segment_and_save(
    dataset_id: str,
    image_id: str,
    model_id: str = Form(...),
    current_user: UserResponse = Depends(get_current_user),
) -> SegmentationResponse:
    # Verify image ownership
    img_rec = _db().table("images").select("*").eq("id", image_id).eq("dataset_id", dataset_id).limit(1).execute()
    if not img_rec.data:
        raise HTTPException(status_code=404, detail="Image not found.")
    if img_rec.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your image.")

    # Download image from storage
    raw = storage.download_image(img_rec.data[0]["storage_path"])
    image = PILImage.open(io.BytesIO(raw)).convert("RGB")

    # Run segmentation
    svc = get_model_service()
    try:
        mask = svc.predict_mask(image)
    except ModelPredictError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Upload mask
    seg_id = str(uuid.uuid4())
    mask_path = storage.upload_mask(mask, user_id=current_user.id, segmentation_id=seg_id)

    classes_found = [
        svc.class_names[i]
        for i in np.unique(mask).tolist()
        if i < len(svc.class_names)
    ]

    record = {
        "id": seg_id,
        "image_id": image_id,
        "model_id": model_id,
        "user_id": current_user.id,
        "mask_path": mask_path,
        "classes_found": classes_found,
        "created_at": _now(),
    }
    res = _db().table("segmentations").insert(record).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save segmentation.")

    return SegmentationResponse(**res.data[0])


@router.get("/{dataset_id}/images/{image_id}/segmentations")
def list_segmentations(
    dataset_id: str,
    image_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> list[SegmentationResponse]:
    img_rec = _db().table("images").select("id,user_id").eq("id", image_id).limit(1).execute()
    if not img_rec.data:
        raise HTTPException(status_code=404, detail="Image not found.")
    if img_rec.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your image.")

    res = _db().table("segmentations").select("*").eq("image_id", image_id).execute()
    return [SegmentationResponse(**s) for s in (res.data or [])]


# ── COCO Import ───────────────────────────────────────────────────────────────

@router.post("/import/coco", response_model=DatasetResponse, status_code=201)
async def import_coco_dataset(
    name: str = Form(...),
    description: str | None = Form(None),
    version: str = Form("1.0.0"),
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
) -> DatasetResponse:
    """Import a COCO dataset from a ZIP containing train/test/valid splits with annotations."""

    if file.content_type != "application/zip" and not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive.")

    zip_data = await file.read()
    if not zip_data:
        raise HTTPException(status_code=400, detail="Empty ZIP file.")

    try:
        from pycocotools.coco import COCO

        # Crear dataset
        now = _now()
        dataset_data = {
            "user_id": current_user.id,
            "name": name.strip(),
            "description": description,
            "tags": ["coco"],
            "version": version,
            "image_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        res = _db().table("datasets").insert(dataset_data).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create dataset.")
        dataset = DatasetResponse(**res.data[0])

        image_count = 0

        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            all_files = zf.namelist()
            splits = ["train", "test", "valid"]

            for split in splits:
                # Buscar el JSON de anotaciones COCO para este split
                # Soporta: _annotations.coco.json o cualquier .json en la carpeta
                annotation_path = next(
                    (
                        f for f in all_files
                        if f.startswith(f"{split}/") and f.endswith(".json")
                    ),
                    None,
                )

                # Cargar anotaciones COCO si existen
                coco_by_filename: dict = {}
                coco_obj = None
                if annotation_path:
                    try:
                        ann_data = json.loads(zf.read(annotation_path).decode("utf-8"))

                        # Escribir a archivo temporal para pycocotools
                        import tempfile, os
                        with tempfile.NamedTemporaryFile(
                            delete=False, suffix=".json", mode="w"
                        ) as tmp:
                            json.dump(ann_data, tmp)
                            tmp_path = tmp.name

                        coco_obj = COCO(tmp_path)
                        os.unlink(tmp_path)

                        # Indexar por filename
                        for coco_img in coco_obj.loadImgs(coco_obj.getImgIds()):
                            coco_by_filename[coco_img["file_name"]] = coco_img
                    except Exception:
                        coco_obj = None

                # Procesar imágenes del split
                split_image_files = [
                    f for f in all_files
                    if f.startswith(f"{split}/")
                    and not f.endswith("/")
                    and Path(f).suffix.lower() in {".png", ".jpg", ".jpeg", ".tiff"}
                ]

                for file_path in split_image_files:
                    try:
                        file_data = zf.read(file_path)
                        img = PILImage.open(io.BytesIO(file_data)).convert("RGB")
                        width, height = img.size
                        ext = Path(file_path).suffix.lower()
                        fmt = ext.lstrip(".")
                        filename = Path(file_path).name

                        image_id = str(uuid.uuid4())
                        storage_path = storage.upload_image(
                            data=file_data,
                            filename=filename,
                            user_id=current_user.id,
                            dataset_id=dataset.id,
                            image_id=image_id,
                        )

                        image_record = {
                            "id": image_id,
                            "dataset_id": dataset.id,
                            "user_id": current_user.id,
                            "filename": filename,
                            "storage_path": storage_path,
                            "width": width,
                            "height": height,
                            "format": fmt,
                            "size_bytes": len(file_data),
                            "created_at": _now(),
                            "split": split,
                        }
                        _db().table("images").insert(image_record).execute()
                        image_count += 1

                        # ── Generar máscara desde anotaciones COCO ──────────
                        print(f"[COCO] coco_obj={coco_obj is not None}, filename={filename}, in_index={filename in coco_by_filename}")

                        if coco_obj and filename in coco_by_filename:
                            try:
                                coco_img = coco_by_filename[filename]
                                ann_ids = coco_obj.getAnnIds(imgIds=coco_img["id"])
                                anns = coco_obj.loadAnns(ann_ids)
                                print(f"[COCO] {filename} → {len(anns)} anotaciones")

                                if anns:
                                    mask = np.zeros((height, width), dtype=np.uint8)
                                    for ann in anns:
                                        class_id = ann["category_id"]
                                        rle_mask = coco_obj.annToMask(ann)
                                        mask[rle_mask > 0] = class_id

                                    seg_id = str(uuid.uuid4())
                                    mask_path = storage.upload_mask(
                                        mask,
                                        user_id=current_user.id,
                                        segmentation_id=seg_id,
                                    )
                                    print(f"[COCO] Máscara subida: {mask_path}")

                                    unique_ids = [int(i) for i in np.unique(mask) if i > 0]
                                    cats = coco_obj.loadCats(unique_ids) if unique_ids else []
                                    classes_found = [c["name"] for c in cats]

                                    seg_record = {
                                        "id": seg_id,
                                        "image_id": image_id,
                                        "user_id": current_user.id,
                                        "mask_path": mask_path,
                                        "classes_found": classes_found,
                                        "created_at": _now(),
                                    }
                                    result = _db().table("segmentations").insert(seg_record).execute()
                                    print(f"[COCO] Segmentación guardada: {result.data}")

                            except Exception as e:
                                print(f"[COCO] ERROR en {filename}: {e}")
                                import traceback
                                traceback.print_exc()

                    except Exception:
                        continue

        if image_count > 0:
            _db().table("datasets").update({"image_count": image_count}).eq("id", dataset.id).execute()
            dataset.image_count = image_count

        return dataset

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import COCO dataset: {str(e)}")