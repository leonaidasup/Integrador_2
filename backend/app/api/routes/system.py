from __future__ import annotations

from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
import psutil
import GPUtil

from app.core.supabase_client import get_supabase_client

router = APIRouter(prefix="/system", tags=["system"])


class ResourceMetrics(BaseModel):
    cpu_usage: float = 0
    ram_gb: float = 0
    ram_max_gb: float = 0
    gpu_usage: float = 0
    datasets_gb: float = 0
    models_gb: float = 0


class ErrorItem(BaseModel):
    label: str
    count: int
    last: str
    icon: str


class ActivityLogItem(BaseModel):
    timestamp: str
    event: str
    type: str
    user: str
    description: str
    status: str


class SystemOverviewResponse(BaseModel):
    metrics: ResourceMetrics
    errors: List[ErrorItem]
    activity_log: List[ActivityLogItem]


@router.get("/overview", response_model=SystemOverviewResponse)
def get_system_overview() -> SystemOverviewResponse:
    """Get system overview with resource usage, errors, and activity log."""
    try:
        client = get_supabase_client()
        
        # Get CPU and RAM metrics
        cpu_usage = psutil.cpu_percent(interval=1)
        ram_info = psutil.virtual_memory()
        ram_gb = ram_info.used / (1024**3)
        ram_max_gb = ram_info.total / (1024**3)
        
        # Get GPU metrics
        gpu_usage = 0
        try:
            gpus = GPUtil.getGPUs()
            if gpus:
                gpu_usage = gpus[0].load * 100
        except Exception:
            gpu_usage = 0
        
        # Calculate storage metrics from database
        models_resp = client.table("models").select("file_size_bytes").execute()
        total_models_bytes = sum(m.get("file_size_bytes", 0) for m in (models_resp.data or []))
        total_models_gb = total_models_bytes / (1024**3)
        
        datasets_resp = client.table("datasets").select("file_size_bytes").execute()
        total_datasets_bytes = sum(d.get("file_size_bytes", 0) for d in (datasets_resp.data or []))
        total_datasets_gb = total_datasets_bytes / (1024**3)
        
        # Get recent experiments for activity log
        experiments_resp = client.table("experiments").select(
            "name,status,created_at,user_id"
        ).order("created_at", desc=True).limit(8).execute()
        
        # Get user emails mapping
        users_resp = client.table("users").select("id,email").execute()
        user_email_map = {u["id"]: u["email"] for u in (users_resp.data or [])}
        
        activity_log = [
            ActivityLogItem(
                timestamp=e["created_at"][:16].replace("T", " ") if e.get("created_at") else "N/A",
                event=e["name"],
                type="Training" if "train" in e["name"].lower() else "Experiment",
                user=user_email_map.get(e.get("user_id"), "system"),
                description=f"Experiment: {e['name']}",
                status="Done" if e["status"] == "completed" else "Running" if e["status"] == "running" else "Failed" if e["status"] == "failed" else e["status"].capitalize()
            )
            for e in (experiments_resp.data or [])
        ]
        
        # Get error counts from experiments
        errors_resp = client.table("experiments").select("status").execute()
        failed_count = sum(1 for e in (errors_resp.data or []) if e.get("status") == "failed")
        
        errors = [
            ErrorItem(
                label="Experiment Failures",
                count=failed_count,
                last="Recently" if failed_count > 0 else "N/A",
                icon="alert-circle"
            )
        ]
        
        metrics = ResourceMetrics(
            cpu_usage=round(cpu_usage, 1),
            ram_gb=round(ram_gb, 1),
            ram_max_gb=round(ram_max_gb, 1),
            gpu_usage=round(gpu_usage, 1),
            datasets_gb=round(total_datasets_gb, 1),
            models_gb=round(total_models_gb, 1)
        )
        
        return SystemOverviewResponse(
            metrics=metrics,
            errors=errors,
            activity_log=activity_log
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching system overview.",
        ) from exc
