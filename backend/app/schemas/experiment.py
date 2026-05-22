from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ExperimentCreate(BaseModel):
    name: str
    model_id: str
    dataset_id: str
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = {}


class ExperimentUpdate(BaseModel):
    status: Optional[str] = None
    results: Optional[Dict[str, Any]] = None


class TrainingProgress(BaseModel):
    """Progress update for a training epoch."""

    epoch: int
    total_epochs: int
    status: str
    loss: Optional[float] = None
    val_loss: Optional[float] = None
    metrics: Optional[Dict[str, float]] = None
    error: Optional[str] = None


class ExperimentResponse(BaseModel):
    id: str
    name: str
    model_id: str
    dataset_id: str
    description: Optional[str]
    config: Optional[Dict[str, Any]]
    status: str
    results: Optional[Dict[str, Any]]
    progress: Optional[TrainingProgress] = None
    created_at: datetime
    updated_at: datetime


class ExperimentListResponse(BaseModel):
    experiments: List[ExperimentResponse]
    total: int
