from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException

from app.api.routes.auth import UserResponse, get_current_user
from app.core.supabase_client import get_supabase_client
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentListResponse,
    ExperimentResponse,
    ExperimentUpdate,
)
from app.services.training_service import get_training_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


def _db():
    return get_supabase_client()


def _now() -> str:
    return datetime.utcnow().isoformat()


def _check_ownership(exp_id: str, user_id: str) -> dict:
    """Fetch experiment and verify it belongs to user via model ownership."""
    res = _db().table("experiments").select("*").eq("id", exp_id).limit(1).execute()
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
    res = _db().table("experiments").insert(record).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create experiment.")
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

    res = _db().table("experiments").select("*").in_("model_id", model_ids).execute()
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

    res = _db().table("experiments").update(updates).eq("id", experiment_id).execute()
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


# ────────────────────────────────────────────────────────────────────────────
# Training Control Endpoints
# ────────────────────────────────────────────────────────────────────────────


@router.post("/{experiment_id}/train", response_model=ExperimentResponse)
def start_training(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> ExperimentResponse:
    """Start fine-tuning training for an experiment."""
    exp = _check_ownership(experiment_id, current_user.id)

    if exp["status"] not in ("pending", "paused"):
        raise HTTPException(status_code=400, detail="Experiment is already running or finished.")

    # Get training service and create experiment state
    training_service = get_training_service()

    # Load dataset images for training
    db = _db()
    images_res = db.table("images").select("id,storage_path").eq("dataset_id", exp["dataset_id"]).execute()

    if not images_res.data:
        raise HTTPException(status_code=400, detail="Dataset has no images.")

    # Convert to PIL images (in real scenario, would load from storage)
    images = []
    # TODO: Actually download and convert images from storage_path

    # Create experiment state and start training
    state = training_service.create_experiment(
        name=exp["name"],
        dataset_id=exp["dataset_id"],
        model_id=exp["model_id"],
        epochs=exp["config"].get("epochs", 10),
        images=images,
        user_id=current_user.id,
        architecture=exp["config"].get("architecture"),
        encoder=exp["config"].get("encoder"),
        hyperparameters=exp["config"],
    )

    # Update status in DB
    db.table("experiments").update({"status": "running"}).eq("id", experiment_id).execute()

    exp_updated = db.table("experiments").select("*").eq("id", experiment_id).limit(1).execute()
    return ExperimentResponse(**exp_updated.data[0])


@router.get("/{experiment_id}/progress")
def get_training_progress(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    """Get current training progress."""
    exp = _check_ownership(experiment_id, current_user.id)

    training_service = get_training_service()
    state = training_service.get(experiment_id)

    if not state:
        return {
            "experiment_id": experiment_id,
            "status": exp["status"],
            "progress": 0,
            "current_epoch": 0,
            "total_epochs": exp["config"].get("epochs", 10),
        }

    return {
        "experiment_id": experiment_id,
        "status": state.status.value,
        "progress": round(state.current_epoch / max(state.epochs, 1) * 100),
        "current_epoch": state.current_epoch,
        "total_epochs": state.epochs,
        "best_loss": state.best_loss,
        "best_iou": state.best_iou,
        "best_accuracy": state.best_accuracy,
        "last_epoch_history": state.epoch_history[-1] if state.epoch_history else None,
    }


@router.post("/{experiment_id}/pause")
def pause_training(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    """Pause an ongoing training."""
    _check_ownership(experiment_id, current_user.id)

    training_service = get_training_service()
    success = training_service.pause(experiment_id)

    if not success:
        raise HTTPException(status_code=400, detail="Experiment is not running.")

    return {"status": "paused", "experiment_id": experiment_id}


@router.post("/{experiment_id}/resume")
def resume_training(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    """Resume a paused training."""
    _check_ownership(experiment_id, current_user.id)

    training_service = get_training_service()
    success = training_service.resume(experiment_id)

    if not success:
        raise HTTPException(status_code=400, detail="Experiment is not paused.")

    return {"status": "resumed", "experiment_id": experiment_id}


@router.post("/{experiment_id}/stop")
def stop_training(
    experiment_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    """Stop/cancel an ongoing training."""
    exp = _check_ownership(experiment_id, current_user.id)

    training_service = get_training_service()
    success = training_service.cancel(experiment_id)

    if not success:
        raise HTTPException(status_code=400, detail="Experiment cannot be stopped at this stage.")

    # Update DB
    _db().table("experiments").update({"status": "cancelled"}).eq("id", experiment_id).execute()

    return {"status": "stopped", "experiment_id": experiment_id}
