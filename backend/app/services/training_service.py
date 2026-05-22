from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Dict, List, Optional

import numpy as np
import torch
from PIL import Image

from app.services.model_manager import MODEL_MANAGER, ModelLoadError, ModelPredictError


class TrainingStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Epoch progress (SSE payload) ──────────────────────────────────────────────

@dataclass
class EpochProgress:
    experiment_id: str
    epoch: int
    total_epochs: int
    status: TrainingStatus
    error: Optional[str] = None
    # Metrics for the current epoch
    loss: Optional[float] = None
    val_loss: Optional[float] = None
    accuracy: Optional[float] = None
    val_accuracy: Optional[float] = None
    iou: Optional[float] = None
    val_iou: Optional[float] = None
    duration_seconds: Optional[float] = None

    def as_dict(self) -> dict:
        return {
            "experiment_id": self.experiment_id,
            "epoch": self.epoch,
            "total_epochs": self.total_epochs,
            "progress": round(self.epoch / self.total_epochs * 100) if self.total_epochs else 0,
            "status": self.status.value,
            "error": self.error,
            "metrics": {
                "loss": self.loss,
                "val_loss": self.val_loss,
                "accuracy": self.accuracy,
                "val_accuracy": self.val_accuracy,
                "iou": self.iou,
                "val_iou": self.val_iou,
                "duration_seconds": self.duration_seconds,
            },
        }


# ── In-memory experiment state ────────────────────────────────────────────────

@dataclass
class ExperimentState:
    id: str
    name: str
    dataset_id: str
    model_id: str
    epochs: int
    user_id: str
    architecture: Optional[str] = None
    encoder: Optional[str] = None
    hyperparameters: Optional[dict] = None

    status: TrainingStatus = TrainingStatus.QUEUED
    current_epoch: int = 0
    error: Optional[str] = None

    # Metrics history (per epoch)
    epoch_history: list = field(default_factory=list)

    # Aggregate bests
    best_loss: Optional[float] = None
    best_iou: Optional[float] = None
    best_accuracy: Optional[float] = None

    # Timing
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    # SSE subscribers
    subscribers: List[Callable[[EpochProgress], None]] = field(default_factory=list)
    _pause_event: threading.Event = field(default_factory=threading.Event)
    _cancel_flag: bool = False

    def __post_init__(self):
        self._pause_event.set()

    def subscribe(self, callback):
        self.subscribers.append(callback)

    def unsubscribe(self, callback):
        self.subscribers = [s for s in self.subscribers if s is not callback]

    def notify(self, epoch_progress: Optional[EpochProgress] = None):
        if epoch_progress is None:
            epoch_progress = EpochProgress(
                experiment_id=self.id,
                epoch=self.current_epoch,
                total_epochs=self.epochs,
                status=self.status,
                error=self.error,
            )
        for cb in list(self.subscribers):
            try:
                cb(epoch_progress)
            except Exception:
                pass

    def pause(self):
        self._pause_event.clear()
        self.status = TrainingStatus.PAUSED
        self.notify()

    def resume(self):
        self._pause_event.set()
        self.status = TrainingStatus.RUNNING
        self.notify()

    def cancel(self):
        self._cancel_flag = True
        self._pause_event.set()


# ── Persistence helpers ───────────────────────────────────────────────────────

def _persist_experiment(state: ExperimentState):
    """Upsert the full experiment record to Supabase."""
    try:
        from app.core.supabase_client import get_supabase_client
        db = get_supabase_client()

        total_duration = None
        if state.started_at and state.finished_at:
            start = datetime.fromisoformat(state.started_at)
            end = datetime.fromisoformat(state.finished_at)
            total_duration = (end - start).total_seconds()

        # Serialize epoch_history dicts
        epoch_history_data = [
            e if isinstance(e, dict) else vars(e)
            for e in state.epoch_history
        ]

        record = {
            "id": state.id,
            "user_id": state.user_id,
            "name": state.name,
            "dataset_id": state.dataset_id,
            "model_id": state.model_id,
            "architecture": state.architecture,
            "encoder": state.encoder,
            "epochs_planned": state.epochs,
            "epochs_completed": state.current_epoch,
            "status": state.status.value,
            "error": state.error,
            "hyperparameters": state.hyperparameters or {},
            "best_loss": state.best_loss,
            "best_iou": state.best_iou,
            "best_accuracy": state.best_accuracy,
            "final_loss": epoch_history_data[-1].get("loss") if epoch_history_data else None,
            "final_iou": epoch_history_data[-1].get("iou") if epoch_history_data else None,
            "final_accuracy": epoch_history_data[-1].get("accuracy") if epoch_history_data else None,
            "started_at": state.started_at,
            "finished_at": state.finished_at,
            "total_duration_seconds": total_duration,
            "epoch_history": epoch_history_data,
        }

        db.table("experiments").upsert(record).execute()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to persist experiment %s: %s", state.id, exc)


# ── Metric simulation (replace with real training loop) ───────────────────────

def _simulate_epoch_metrics(epoch: int, total_epochs: int) -> dict:
    """
    Simulates realistic training metrics for an epoch.
    Replace the body of this function with real metric computation
    from your training loop.
    """
    progress = epoch / total_epochs
    # Simulate converging loss
    loss = max(0.05, 1.0 - 0.85 * progress + np.random.normal(0, 0.03))
    val_loss = max(0.08, loss + abs(np.random.normal(0, 0.05)))
    # Simulate improving accuracy / IoU
    accuracy = min(0.99, 0.4 + 0.55 * progress + np.random.normal(0, 0.02))
    val_accuracy = min(0.99, accuracy - abs(np.random.normal(0, 0.03)))
    iou = min(0.95, 0.3 + 0.6 * progress + np.random.normal(0, 0.02))
    val_iou = min(0.95, iou - abs(np.random.normal(0, 0.03)))

    return {
        "loss": round(float(loss), 6),
        "val_loss": round(float(val_loss), 6),
        "accuracy": round(float(accuracy), 6),
        "val_accuracy": round(float(val_accuracy), 6),
        "iou": round(float(iou), 6),
        "val_iou": round(float(val_iou), 6),
    }


# ── Training service ──────────────────────────────────────────────────────────

class TrainingService:
    def __init__(self, max_workers: int = 2):
        self._experiments: Dict[str, ExperimentState] = {}
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(max_workers)

    def create_experiment(
        self,
        name: str,
        dataset_id: str,
        model_id: str,
        epochs: int,
        images: List[Image.Image],
        user_id: str,
        architecture: Optional[str] = None,
        encoder: Optional[str] = None,
        hyperparameters: Optional[dict] = None,
    ) -> ExperimentState:
        exp_id = str(uuid.uuid4())
        state = ExperimentState(
            id=exp_id,
            name=name,
            dataset_id=dataset_id,
            model_id=model_id,
            epochs=max(1, epochs),
            user_id=user_id,
            architecture=architecture,
            encoder=encoder,
            hyperparameters=hyperparameters,
        )
        with self._lock:
            self._experiments[exp_id] = state

        # Persist initial record immediately
        _persist_experiment(state)

        thread = threading.Thread(
            target=self._run_training,
            args=(state, images),
            daemon=True,
        )
        thread.start()
        return state

    def get(self, experiment_id: str) -> Optional[ExperimentState]:
        return self._experiments.get(experiment_id)

    def list_all(self) -> List[ExperimentState]:
        return list(self._experiments.values())

    def pause(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status == TrainingStatus.RUNNING:
            state.pause()
            _persist_experiment(state)
            return True
        return False

    def resume(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status == TrainingStatus.PAUSED:
            state.resume()
            _persist_experiment(state)
            return True
        return False

    def cancel(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status in (TrainingStatus.RUNNING, TrainingStatus.PAUSED, TrainingStatus.QUEUED):
            state.cancel()
            state.status = TrainingStatus.CANCELLED
            state.finished_at = _now_iso()
            state.notify()
            _persist_experiment(state)
            return True
        return False

    def _run_training(self, state: ExperimentState, images: List[Image.Image]):
        with self._semaphore:
            if state._cancel_flag:
                return

            state.status = TrainingStatus.RUNNING
            state.started_at = _now_iso()
            state.notify()
            _persist_experiment(state)

            try:
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                adapter = MODEL_MANAGER._adapter
                if adapter is None:
                    raise RuntimeError("No active model loaded.")

                for epoch in range(1, state.epochs + 1):
                    if state._cancel_flag:
                        state.status = TrainingStatus.CANCELLED
                        state.finished_at = _now_iso()
                        state.notify()
                        _persist_experiment(state)
                        return

                    state._pause_event.wait()

                    if state._cancel_flag:
                        state.status = TrainingStatus.CANCELLED
                        state.finished_at = _now_iso()
                        state.notify()
                        _persist_experiment(state)
                        return

                    epoch_start = time.time()

                    # Run inference on available images
                    for img in images[:min(len(images), 5)]:
                        try:
                            MODEL_MANAGER.predict(img, device)
                        except (ModelPredictError, Exception):
                            pass

                    # Simulate epoch time
                    time.sleep(0.5)

                    epoch_duration = round(time.time() - epoch_start, 3)

                    # ── Compute / simulate metrics ──────────────────────────
                    metrics = _simulate_epoch_metrics(epoch, state.epochs)
                    # TODO: replace _simulate_epoch_metrics() with real values
                    # from your training loop, e.g.:
                    #   metrics = your_train_one_epoch(model, loader, optimizer)

                    epoch_record = {
                        "epoch": epoch,
                        "duration_seconds": epoch_duration,
                        **metrics,
                    }
                    state.epoch_history.append(epoch_record)
                    state.current_epoch = epoch

                    # Update bests
                    loss = metrics.get("loss")
                    iou = metrics.get("iou")
                    accuracy = metrics.get("accuracy")
                    if loss is not None and (state.best_loss is None or loss < state.best_loss):
                        state.best_loss = loss
                    if iou is not None and (state.best_iou is None or iou > state.best_iou):
                        state.best_iou = iou
                    if accuracy is not None and (state.best_accuracy is None or accuracy > state.best_accuracy):
                        state.best_accuracy = accuracy

                    # Notify SSE subscribers with metrics
                    progress = EpochProgress(
                        experiment_id=state.id,
                        epoch=epoch,
                        total_epochs=state.epochs,
                        status=state.status,
                        duration_seconds=epoch_duration,
                        **metrics,
                    )
                    state.notify(progress)

                    # Persist after every epoch
                    _persist_experiment(state)

                state.status = TrainingStatus.COMPLETED
                state.finished_at = _now_iso()
                state.notify()
                _persist_experiment(state)

            except Exception as exc:
                state.status = TrainingStatus.FAILED
                state.error = str(exc)
                state.finished_at = _now_iso()
                state.notify()
                _persist_experiment(state)


_training_service = TrainingService(max_workers=2)


def get_training_service() -> TrainingService:
    return _training_service