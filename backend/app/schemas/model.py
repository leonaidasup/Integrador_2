from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    device: str
    model_loaded: bool
    model_framework: Optional[str]
    classes: List[str]


class LoadModelResponse(BaseModel):
    status: str
    filename: str
    framework: str
    model_loaded: bool


class SegmentResponse(BaseModel):
    filename: str
    classes: List[str]
    mask_base64: str
    segmented_base64: str
    model_loaded: bool
