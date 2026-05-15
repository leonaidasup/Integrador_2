from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


ArtifactType = Literal["full_model", "weights"]


class ModelRegistryRequest(BaseModel):
    """Request to register a new model."""
    name: str
    version: str
    description: Optional[str] = None
    framework: str = "keras"
    architecture: Optional[str] = None
    artifact_type: ArtifactType = "full_model"
    classes: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)


class ModelRegistryResponse(BaseModel):
    """Response containing registered model metadata."""
    id: str
    name: str
    version: str
    description: Optional[str]
    framework: str
    architecture: Optional[str] = None
    artifact_type: ArtifactType = "full_model"
    artifact_path: str
    classes: List[str] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    active: bool
    mlflow_run_id: Optional[str]
    run_metadata: Dict[str, Any] = Field(default_factory=dict)
    last_activation_status: Optional[str] = None
    last_activation_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    uploaded_by: Optional[str]


class ModelListResponse(BaseModel):
    """List of registered models."""
    models: List[ModelRegistryResponse]
    total: int


class ModelActivateRequest(BaseModel):
    """Request to activate a model."""
    model_id: str


class ModelDeleteRequest(BaseModel):
    """Request to delete a model."""
    model_id: str


class ModelStatusResponse(BaseModel):
    """Current status of the model registry."""
    active_model: Optional[ModelRegistryResponse]
    total_models: int
    models_count_by_framework: dict
