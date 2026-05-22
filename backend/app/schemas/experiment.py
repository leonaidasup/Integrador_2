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


class ExperimentResponse(BaseModel):
    id: str
    name: str
    model_id: str
    dataset_id: str
    description: Optional[str]
    config: Optional[Dict[str, Any]]
    status: str
    results: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class ExperimentListResponse(BaseModel):
    experiments: List[ExperimentResponse]
    total: int