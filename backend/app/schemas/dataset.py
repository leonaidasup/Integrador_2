from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    version: str = "1.0.0"


class DatasetResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    tags: List[str]
    version: str
    image_count: int
    created_at: datetime
    updated_at: datetime


class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]
    total: int


class ImageResponse(BaseModel):
    id: str
    dataset_id: str
    user_id: str
    filename: str
    storage_path: str
    width: Optional[int]
    height: Optional[int]
    format: Optional[str]
    size_bytes: Optional[int]
    created_at: datetime


class ImageListResponse(BaseModel):
    images: List[ImageResponse]
    total: int


class SegmentationResponse(BaseModel):
    id: str
    image_id: str
    model_id: str
    user_id: str
    mask_path: str
    classes_found: List[str]
    created_at: datetime


class SegmentAndSaveRequest(BaseModel):
    image_id: str
    model_id: str