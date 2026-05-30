from __future__ import annotations

import math
import random
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.api.routes.auth import UserResponse, get_current_user
from app.core.supabase_client import get_supabase_client
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentListResponse,
    ExperimentResponse,
    ExperimentUpdate,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


def _db():
    return get_supabase_client()


def _now() -> str:
    return datetime.utcnow().isoformat()


def _raise_schema_error(exc: APIError) -> None:
    if getattr(exc, "code", None) == "PGRST205" or "public.experiments" in str(exc):
        raise HTTPException(
            status_code=503,
            detail=(
                "The experiments table does not exist in Supabase. "
                "Run backend/supabase_schema.sql or create public.experiments."
            ),
        ) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _round_metric(value: float) -> float:
    return round(float(value), 4)


def _make_training_run(exp: dict, dataset: dict, model: dict) -> dict:
    """Create a compact fine-tuning run payload for Analytics.

    This is a deterministic-friendly simulated fine-tuning pass: it uses the
    selected model, dataset size, epochs, batch size and loss function from the
    experiment config, then stores per-epoch metrics in the shape Analytics
    already renders. Replace this function with a real trainer when annotated
    masks/loaders are available.
    """
    config = exp.get("config") or {}
    image_count = max(int(dataset.get("image_count") or 0), 1)
    batch_size = max(int(config.get("batch_size") or 32), 1)
    epochs = max(1, min(int(config.get("epochs") or 8), 50))
    loss_name = str(config.get("loss") or "crossentropy")
    raw_classes = model.get("classes") or ["background", "few-layer", "bulk"]
    class_names = [
        str(name)
        for name in raw_classes
        if str(name).strip() and str(name).lower() != "background"
    ] or [str(name) for name in raw_classes if str(name).strip()] or ["class-1"]

    seed = f"{exp['id']}:{len((exp.get('results') or {}).get('trainings', []))}"
    rng = random.Random(seed)
    dataset_factor = min(0.18, math.log10(image_count + 1) / 12)
    model_factor = 0.04 if model.get("active") else 0.0
    loss_factor = {
        "crossentropy": 0.04,
        "dice": 0.06,
        "focal": 0.05,
        "bce": 0.03,
        "mse": 0.01,
    }.get(loss_name.lower(), 0.025)

    epochs_payload = []
    for epoch in range(1, epochs + 1):
        progress = epoch / epochs
        noise = rng.uniform(-0.018, 0.018)
        quality = _clamp(0.36 + (0.44 * progress) + dataset_factor + model_factor + loss_factor + noise)
        loss = max(0.035, (1.15 - 0.9 * progress) * (1.0 - loss_factor) + rng.uniform(-0.025, 0.025))
        precision = _clamp(quality + rng.uniform(-0.025, 0.035))
        recall = _clamp(quality + rng.uniform(-0.035, 0.025))
        f1 = 0.0 if precision + recall == 0 else (2 * precision * recall) / (precision + recall)
        dice = _clamp(f1 + rng.uniform(-0.018, 0.018))
        iou = _clamp(dice / (2 - dice) + rng.uniform(-0.012, 0.012))
        epochs_payload.append({
            "epoch": epoch,
            "loss": _round_metric(loss),
            "precision": _round_metric(precision),
            "recall": _round_metric(recall),
            "f1": _round_metric(f1),
            "dice": _round_metric(dice),
            "iou": _round_metric(iou),
        })

    last = epochs_payload[-1]
    weights = [rng.uniform(0.7, 1.4) for _ in class_names]
    weight_total = sum(weights) or 1
    distribution = [
        max(1, int(round(image_count * weight / weight_total)))
        for weight in weights
    ]
    distribution[-1] += image_count - sum(distribution)
    distribution = [max(0, value) for value in distribution]

    confusion = []
    for row_index, samples in enumerate(distribution):
        row = [0 for _ in class_names]
        correct = int(samples * _clamp(last["recall"] - rng.uniform(0.02, 0.08), 0.35, 0.97))
        row[row_index] = correct
        remaining = max(0, samples - correct)
        other_indexes = [index for index in range(len(class_names)) if index != row_index]
        for index, class_index in enumerate(other_indexes):
            if index == len(other_indexes) - 1:
                row[class_index] += remaining
            else:
                spill = rng.randint(0, remaining) if remaining > 0 else 0
                row[class_index] += spill
                remaining -= spill
        confusion.append(row)

    seconds = max(1, int(epochs * max(1, math.ceil(image_count / batch_size)) * 3))
    duration = f"{seconds // 60}m {seconds % 60}s" if seconds >= 60 else f"{seconds}s"

    return {
        "id": str(uuid.uuid4())[:8],
        "date": _now(),
        "batch": batch_size,
        "loss_function": loss_name,
        "iou": last["iou"],
        "dice": last["dice"],
        "recall": last["recall"],
        "precision": last["precision"],
        "f1": last["f1"],
        "loss": last["loss"],
        "duration": duration,
        "status": "completed",
        "class_names": class_names,
        "epochs": epochs_payload,
        "confusion": confusion,
        "dataset_class_distribution": [
            {"name": name, "value": distribution[index]}
            for index, name in enumerate(class_names)
        ],
        "label_dist": [
            {"name": name, "value": distribution[index]}
            for index, name in enumerate(class_names)
        ],
    }


def _check_ownership(exp_id: str, user_id: str) -> dict:
    """Fetch experiment and verify it belongs to user via model ownership."""
    try:
        res = _db().table("experiments").select("*").eq("id", exp_id).limit(1).execute()
    except APIError as exc:
        _raise_schema_error(exc)
    if not res.data:
        raise HTTPException(status_code=404, detail="Experiment not found.")
    exp = res.data[0]
    # verify via model ownership
    model = _db().table("models").select("uploaded_by").eq("id", exp["model_id"]).limit(1).execute()
    if not model.data or model.data[0]["uploaded_by"] != user_id:
        raise HTTPException(status_code=403, detail="Not your experiment.")
    return exp


@router.post("", response_model=ExperimentResponse, status_code=201)
def create_experiment(
    payload: ExperimentCreate,
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentResponse:
    # Verify model belongs to user
    model = _db().table("models").select("id,uploaded_by").eq("id", payload.model_id).limit(1).execute()
    if not model.data:
        raise HTTPException(status_code=404, detail="Model not found.")
    if model.data[0]["uploaded_by"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your model.")

    # Verify dataset belongs to user
    dataset = _db().table("datasets").select("id,user_id").eq("id", payload.dataset_id).limit(1).execute()
    if not dataset.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if dataset.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")

    now = _now()
    record = {
        "name": payload.name.strip(),
        "model_id": payload.model_id,
        "dataset_id": payload.dataset_id,
        "description": payload.description,
        "config": payload.config or {},
        "status": "pending",
        "results": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        res = _db().table("experiments").insert(record).execute()
    except APIError as exc:
        _raise_schema_error(exc)
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create experiment.")
    return ExperimentResponse(**res.data[0])


@router.post("/{experiment_id}/train", response_model=ExperimentResponse)
def train_experiment(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentResponse:
    exp = _check_ownership(experiment_id, current_user.id)

    model = _db().table("models").select("*").eq("id", exp["model_id"]).limit(1).execute()
    if not model.data:
        raise HTTPException(status_code=404, detail="Model not found.")

    dataset = _db().table("datasets").select("*").eq("id", exp["dataset_id"]).limit(1).execute()
    if not dataset.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if dataset.data[0].get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")
    if int(dataset.data[0].get("image_count") or 0) <= 0:
        raise HTTPException(status_code=400, detail="Dataset must contain at least one image.")

    # Model loading is handled by TrainingService; skip here to avoid pre-loading errors
    # (e.g., Mask R-CNN expects .h5 but training loop can handle it)

    # Launch real training in background
    try:
        from app.services.training_service import get_training_service
        from PIL import Image as PILImage
        import io as _io
        from app.services import storage

        training_svc = get_training_service()
        
        # Fetch image data for training
        images = []
        img_records = _db().table("images").select("storage_path").eq("dataset_id", exp["dataset_id"]).execute()
        for rec in (img_records.data or [])[:50]:  # Limit to 50 for memory
            try:
                img_bytes = storage.download_image(rec["storage_path"])
                pil_img = PILImage.open(_io.BytesIO(img_bytes)).convert("RGB")
                images.append(pil_img)
            except Exception:
                pass

        # Start training (runs in background thread)
        epochs = int((exp.get("config") or {}).get("epochs", 8))
        hyperparameters = (exp.get("config") or {})
        training_svc.run_existing_experiment(
            experiment_id=experiment_id,
            name=exp["name"],
            dataset_id=exp["dataset_id"],
            model_id=exp["model_id"],
            epochs=max(1, min(epochs, 50)),
            images=images,
            user_id=current_user.id,
            architecture=(exp.get("config") or {}).get("architecture"),
            encoder=(exp.get("config") or {}).get("encoder"),
            hyperparameters=hyperparameters,
        )

        # Return with status "running"
        res = _db().table("experiments").update({
            "status": "running",
            "updated_at": _now(),
        }).eq("id", experiment_id).execute()
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to start training: {exc}")

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update experiment status.")
    return ExperimentResponse(**res.data[0])


@router.get("", response_model=ExperimentListResponse)
def list_experiments(
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentListResponse:
    # Join via models to filter by owner
    models_res = _db().table("models").select("id").eq("uploaded_by", current_user.id).execute()
    model_ids = [m["id"] for m in (models_res.data or [])]
    if not model_ids:
        return ExperimentListResponse(experiments=[], total=0)

    try:
        res = _db().table("experiments").select("*").in_("model_id", model_ids).execute()
    except APIError as exc:
        _raise_schema_error(exc)
    experiments = [ExperimentResponse(**e) for e in (res.data or [])]
    return ExperimentListResponse(experiments=experiments, total=len(experiments))


@router.get("/{experiment_id}", response_model=ExperimentResponse)
def get_experiment(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentResponse:
    exp = _check_ownership(experiment_id, current_user.id)
    return ExperimentResponse(**exp)


@router.patch("/{experiment_id}", response_model=ExperimentResponse)
def update_experiment(
    experiment_id: str,
    payload: ExperimentUpdate,
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentResponse:
    _check_ownership(experiment_id, current_user.id)

    updates: dict = {"updated_at": _now()}
    if payload.status is not None:
        allowed = {"pending", "running", "completed", "failed", "paused"}
        if payload.status not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")
        updates["status"] = payload.status
    if payload.results is not None:
        updates["results"] = payload.results

    try:
        res = _db().table("experiments").update(updates).eq("id", experiment_id).execute()
    except APIError as exc:
        _raise_schema_error(exc)
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update experiment.")
    return ExperimentResponse(**res.data[0])


@router.delete("/{experiment_id}")
def delete_experiment(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    _check_ownership(experiment_id, current_user.id)
    _db().table("experiments").delete().eq("id", experiment_id).execute()
    return {"status": "deleted", "experiment_id": experiment_id}
