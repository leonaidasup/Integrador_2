from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.core.supabase_client import get_supabase_client

router = APIRouter(prefix="/users", tags=["users"])


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Literal["user", "admin"]
    created_at: str


class ModelInfo(BaseModel):
    name: str
    size_gb: float


class DatasetInfo(BaseModel):
    name: str
    size_gb: float


class ActivityInfo(BaseModel):
    action: str
    date: str
    status: str


class UserDetailResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    model_storage_gb: float = 0.0
    dataset_storage_gb: float = 0.0
    models: List[ModelInfo] = []
    datasets: List[DatasetInfo] = []
    recent_activity: List[ActivityInfo] = []


@router.get("", response_model=List[UserResponse])
def list_users() -> List[UserResponse]:
    """Get all users from the database."""
    try:
        client = get_supabase_client()
        response = client.table("users").select("id,name,email,role,created_at").execute()
        
        if not response.data:
            return []
        
        users = []
        for user in response.data:
            user_dict = dict(user)
            if "id" in user_dict and user_dict["id"] is not None:
                user_dict["id"] = str(user_dict["id"])
            users.append(UserResponse(**user_dict))
        
        return users
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching users.",
        ) from exc


@router.get("/{user_id}", response_model=UserDetailResponse)
def get_user_details(user_id: str) -> UserDetailResponse:
    """Get detailed info for a specific user including models, datasets, and activity."""
    try:
        client = get_supabase_client()
        
        # Fetch user with resource usage
        user_resp = client.table("users").select("id,name,email,role,cpu_usage_percent,gpu_usage_percent").eq("id", user_id).limit(1).execute()
        if not user_resp.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        user = user_resp.data[0]
        
        # Fetch datasets belonging to this user (filtered by user_id)
        datasets_resp = client.table("datasets").select("name,file_size_bytes").eq("user_id", user_id).execute()
        datasets = [
            DatasetInfo(
                name=d["name"], 
                size_gb=float(d.get("file_size_bytes", 0)) / (1024**3)  # Convert bytes to GB
            ) 
            for d in (datasets_resp.data or [])
        ]
        
        # Fetch experiments for this user (filter by user_id), sorted by recent
        experiments_resp = client.table("experiments").select("name,status,created_at").eq("user_id", user_id).order("created_at", desc=True).limit(3).execute()
        activity = [
            ActivityInfo(
                action=e["name"],
                date=e["created_at"][:10] if e["created_at"] else "N/A",
                status="Success" if e["status"] == "completed" else "Pending" if e["status"] == "pending" else e["status"].capitalize()
            )
            for e in (experiments_resp.data or [])
        ]
        
        # Count models used by this user (through experiments)
        # Models are linked via experiments, so get unique model_ids from user's experiments
        models_resp = client.table("experiments").select("model_id").eq("user_id", user_id).execute()
        unique_model_ids = list(set(e.get("model_id") for e in (models_resp.data or []) if e.get("model_id")))
        
        models = []
        if unique_model_ids:
            # Fetch actual model details with file size
            for model_id in unique_model_ids[:5]:  # Limit to 5 models shown
                model_data = client.table("models").select("name,file_size_bytes").eq("id", model_id).limit(1).execute()
                if model_data.data:
                    file_size_gb = float(model_data.data[0].get("file_size_bytes", 0)) / (1024**3)
                    models.append(ModelInfo(name=model_data.data[0]["name"], size_gb=file_size_gb))
        
        total_model_storage = sum(m.size_gb for m in models)
        total_dataset_storage = sum(d.size_gb for d in datasets)
        
        return UserDetailResponse(
            id=str(user["id"]),
            name=user["name"],
            email=user["email"],
            role=user["role"],
            model_storage_gb=total_model_storage,
            dataset_storage_gb=total_dataset_storage,
            models=models,
            datasets=datasets,
            recent_activity=activity
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching user details.",
        ) from exc

