from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
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


@dataclass
class EpochProgress:
    experiment_id: str
    epoch: int
    total_epochs: int
    status: TrainingStatus
    error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "experiment_id": self.experiment_id,
            "epoch": self.epoch,
            "total_epochs": self.total_epochs,
            "progress": round(self.epoch / self.total_epochs * 100) if self.total_epochs else 0,
            "status": self.status.value,
            "error": self.error,
        }


@dataclass
class ExperimentState:
    id: str
    name: str
    dataset_id: str
    model_id: str
    epochs: int
    status: TrainingStatus = TrainingStatus.QUEUED
    current_epoch: int = 0
    error: Optional[str] = None
    subscribers: List[Callable[[EpochProgress], None]] = field(default_factory=list)
    _pause_event: threading.Event = field(default_factory=threading.Event)
    _cancel_flag: bool = False

    def __post_init__(self):
        self._pause_event.set()  # not paused initially

    def subscribe(self, callback: Callable[[EpochProgress], None]):
        self.subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[EpochProgress], None]):
        self.subscribers = [s for s in self.subscribers if s is not callback]

    def notify(self):
        progress = EpochProgress(
            experiment_id=self.id,
            epoch=self.current_epoch,
            total_epochs=self.epochs,
            status=self.status,
            error=self.error,
        )
        for cb in list(self.subscribers):
            try:
                cb(progress)
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
        self._pause_event.set()  # unblock if paused


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
    ) -> ExperimentState:
        exp_id = str(uuid.uuid4())
        state = ExperimentState(
            id=exp_id,
            name=name,
            dataset_id=dataset_id,
            model_id=model_id,
            epochs=max(1, epochs),
        )
        with self._lock:
            self._experiments[exp_id] = state

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
            return True
        return False

    def resume(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status == TrainingStatus.PAUSED:
            state.resume()
            return True
        return False

    def cancel(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status in (TrainingStatus.RUNNING, TrainingStatus.PAUSED, TrainingStatus.QUEUED):
            state.cancel()
            state.status = TrainingStatus.CANCELLED
            state.notify()
            return True
        return False

    def _run_training(self, state: ExperimentState, images: List[Image.Image]):
        with self._semaphore:
            if state._cancel_flag:
                return

            state.status = TrainingStatus.RUNNING
            state.notify()

            try:
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                adapter = MODEL_MANAGER._adapter
                if adapter is None:
                    raise RuntimeError("No active model loaded.")

                for epoch in range(1, state.epochs + 1):
                    # Check cancel
                    if state._cancel_flag:
                        state.status = TrainingStatus.CANCELLED
                        state.notify()
                        return

                    # Wait if paused
                    state._pause_event.wait()

                    if state._cancel_flag:
                        state.status = TrainingStatus.CANCELLED
                        state.notify()
                        return

                    # Run inference on available images (simulates a training epoch)
                    for img in images[:min(len(images), 5)]:
                        try:
                            MODEL_MANAGER.predict(img, device)
                        except (ModelPredictError, Exception):
                            pass

                    # Simulate epoch time (real training would take longer)
                    time.sleep(0.5)

                    state.current_epoch = epoch
                    state.notify()

                state.status = TrainingStatus.COMPLETED
                state.notify()

            except Exception as exc:
                state.status = TrainingStatus.FAILED
                state.error = str(exc)
                state.notify()


_training_service = TrainingService(max_workers=2)


def get_training_service() -> TrainingService:
    return _training_service