from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, List
import mlflow
from mlflow.tracking import MlflowClient


class MLflowService:
    """Service for logging models to local MLflow tracking."""
    
    def __init__(self, tracking_uri: Optional[str] = None, experiment_name: str = "model-registry"):
        """Initialize MLflow service with local tracking."""
        if tracking_uri is None:
            # Use local file-based tracking in the backend directory
            backend_dir = Path(__file__).resolve().parents[2]
            mlruns_dir = backend_dir / "mlruns"
            mlruns_dir.mkdir(parents=True, exist_ok=True)
            tracking_uri = f"file:{mlruns_dir}"
        
        self.tracking_uri = tracking_uri
        self.experiment_name = experiment_name
        
        # Set MLflow tracking URI
        mlflow.set_tracking_uri(tracking_uri)
        
        # Create or get experiment
        try:
            exp_id = mlflow.get_experiment_by_name(experiment_name)
            if exp_id:
                self.experiment_id = exp_id.experiment_id
            else:
                self.experiment_id = mlflow.create_experiment(experiment_name)
        except Exception as e:
            # Fallback to default experiment
            self.experiment_id = "0"
        
        self.client = MlflowClient(tracking_uri)
    
    def log_model_upload(
        self,
        model_name: str,
        model_version: str,
        framework: str,
        artifact_path: str,
        classes: List[str],
        description: Optional[str] = None,
    ) -> str:
        """
        Log a model upload to MLflow.
        
        Returns:
            MLflow run_id
        """
        with mlflow.start_run(experiment_id=self.experiment_id) as run:
            # Log model metadata
            mlflow.set_tag("model_name", model_name)
            mlflow.set_tag("model_version", model_version)
            mlflow.set_tag("framework", framework)
            
            # Log parameters
            mlflow.log_param("classes_count", len(classes))
            mlflow.log_param("classes", ",".join(classes))
            
            # Log metrics
            mlflow.log_metric("model_size_bytes", Path(artifact_path).stat().st_size if Path(artifact_path).exists() else 0)
            
            # Log artifact metadata
            mlflow.log_text(
                f"Model: {model_name}\nVersion: {model_version}\nFramework: {framework}\nClasses: {', '.join(classes)}\nDescription: {description or 'N/A'}",
                artifact_file="model_metadata.txt"
            )
            
            run_id = run.info.run_id
        
        return run_id
    
    def log_model_activation(self, run_id: str, model_id: str) -> None:
        """Log when a model is activated."""
        try:
            with mlflow.start_run(run_id=run_id, nested=True):
                mlflow.set_tag("event", "model_activated")
                mlflow.log_param("model_id", model_id)
        except Exception:
            # Run may already be ended, create new run instead
            with mlflow.start_run(experiment_id=self.experiment_id):
                mlflow.set_tag("event", "model_activation")
                mlflow.set_tag("parent_run_id", run_id)
                mlflow.log_param("model_id", model_id)
    
    def log_model_deletion(self, model_name: str, model_version: str) -> None:
        """Log when a model is deleted."""
        with mlflow.start_run(experiment_id=self.experiment_id):
            mlflow.set_tag("event", "model_deletion")
            mlflow.set_tag("model_name", model_name)
            mlflow.set_tag("model_version", model_version)
    
    def log_inference(
        self,
        run_id: str,
        image_size: tuple[int, int],
        output_size: tuple[int, int],
        classes_detected: List[str],
    ) -> None:
        """Log an inference event."""
        try:
            with mlflow.start_run(run_id=run_id, nested=True):
                mlflow.log_param("image_width", image_size[0])
                mlflow.log_param("image_height", image_size[1])
                mlflow.log_param("output_width", output_size[0])
                mlflow.log_param("output_height", output_size[1])
                mlflow.log_param("classes_in_output", ",".join(classes_detected))
        except Exception:
            # Run may be ended, skip inference logging
            pass


# Global MLflow service instance
_mlflow_service: Optional[MLflowService] = None


def get_mlflow_service() -> MLflowService:
    """Get or create the global MLflow service."""
    global _mlflow_service
    if _mlflow_service is None:
        _mlflow_service = MLflowService()
    return _mlflow_service
