from __future__ import annotations

import asyncio
import io
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.routes.auth import UserResponse, get_current_user, _decode_token, _get_user_by_id
from app.core.supabase_client import get_supabase_client
from app.services import storage
from app.services.model_service import get_model_service
from app.services.training_service import TrainingStatus, get_training_service

from PIL import Image

router = APIRouter(prefix="/experiments", tags=["experiments"])


def _db():
    return get_supabase_client()


def _get_user_from_token(token: str) -> UserResponse:
    """Auth helper for SSE where headers can't be set by EventSource."""
    payload = _decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token.")
    user = _get_user_by_id(str(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return UserResponse(**user)


# ── Create & start experiment ─────────────────────────────────────────────────

@router.post("", status_code=201)
def create_experiment(
    name: str = Form(...),
    dataset_id: str = Form(...),
    model_id: str = Form(...),
    epochs: int = Form(...),
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    # Verify dataset ownership and get images
    ds = _db().table("datasets").select("id,user_id").eq("id", dataset_id).limit(1).execute()
    if not ds.data:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if ds.data[0]["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your dataset.")

    # Load image records
    img_records = _db().table("images").select("*").eq("dataset_id", dataset_id).execute()
    images = []
    for rec in (img_records.data or []):
        try:
            raw = storage.download_image(rec["storage_path"])
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            images.append(img)
        except Exception:
            pass

    if not images:
        raise HTTPException(status_code=400, detail="Dataset has no images to train on.")

    svc = get_training_service()
    state = svc.create_experiment(
        name=name,
        dataset_id=dataset_id,
        model_id=model_id,
        epochs=epochs,
        images=images,
    )

    return {
        "id": state.id,
        "name": state.name,
        "dataset_id": state.dataset_id,
        "model_id": state.model_id,
        "epochs": state.epochs,
        "status": state.status.value,
        "current_epoch": state.current_epoch,
    }


# ── List experiments ──────────────────────────────────────────────────────────

@router.get("")
def list_experiments(current_user: UserResponse = Depends(get_current_user)) -> list:
    svc = get_training_service()
    return [
        {
            "id": s.id,
            "name": s.name,
            "dataset_id": s.dataset_id,
            "model_id": s.model_id,
            "epochs": s.epochs,
            "current_epoch": s.current_epoch,
            "status": s.status.value,
            "error": s.error,
        }
        for s in svc.list_all()
    ]


# ── SSE progress stream ───────────────────────────────────────────────────────

@router.get("/{experiment_id}/stream")
async def stream_progress(
    experiment_id: str,
    token: str = Query(...),
):
    current_user = _get_user_from_token(token)
    svc = get_training_service()
    state = svc.get(experiment_id)
    if not state:
        raise HTTPException(status_code=404, detail="Experiment not found.")

    async def event_generator() -> AsyncGenerator[str, None]:
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(progress):
            loop.call_soon_threadsafe(queue.put_nowait, progress)

        state.subscribe(on_progress)

        # Send current state immediately
        from app.services.training_service import EpochProgress
        yield f"data: {json.dumps(EpochProgress(experiment_id=state.id, epoch=state.current_epoch, total_epochs=state.epochs, status=state.status).as_dict())}\n\n"

        try:
            terminal = {TrainingStatus.COMPLETED, TrainingStatus.FAILED, TrainingStatus.CANCELLED}
            while True:
                try:
                    progress = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(progress.as_dict())}\n\n"
                    if progress.status in terminal:
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            state.unsubscribe(on_progress)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Pause / Resume / Cancel ───────────────────────────────────────────────────

@router.post("/{experiment_id}/pause")
def pause_experiment(experiment_id: str, current_user: UserResponse = Depends(get_current_user)) -> dict:
    svc = get_training_service()
    if not svc.pause(experiment_id):
        raise HTTPException(status_code=400, detail="Cannot pause experiment.")
    return {"status": "paused"}


@router.post("/{experiment_id}/resume")
def resume_experiment(experiment_id: str, current_user: UserResponse = Depends(get_current_user)) -> dict:
    svc = get_training_service()
    if not svc.resume(experiment_id):
        raise HTTPException(status_code=400, detail="Cannot resume experiment.")
    return {"status": "running"}


@router.post("/{experiment_id}/cancel")
def cancel_experiment(experiment_id: str, current_user: UserResponse = Depends(get_current_user)) -> dict:
    svc = get_training_service()
    if not svc.cancel(experiment_id):
        raise HTTPException(status_code=400, detail="Cannot cancel experiment.")
    return {"status": "cancelled"}