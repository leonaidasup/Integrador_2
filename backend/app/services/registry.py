from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Optional, List
from threading import Lock
import uuid

from app.schemas.registry import ModelRegistryResponse, ModelListResponse


class RegistryError(Exception):
    pass


SUPPORTED_ARTIFACT_EXTENSIONS = {".h5", ".keras", ".pth", ".pt", ".pkl", ".joblib"}
SUPPORTED_ARTIFACT_TYPES = {"full_model", "weights"}


class ModelRegistry:
    """In-memory model registry with Supabase persistence."""

    def __init__(self, supabase_client=None, artifact_base_path: Optional[Path] = None):
        self._lock = Lock()
        self._supabase = supabase_client
        self._artifact_base_path = artifact_base_path or Path(__file__).resolve().parents[2] / "models"
        self._active_model_id: Optional[str] = None
        self._models_cache: dict = {}  # id -> model data
        
        # Ensure artifact directory exists
        self._artifact_base_path.mkdir(parents=True, exist_ok=True)
        
        # Load existing models from Supabase on init
        self._load_models_from_db()

    def _load_models_from_db(self) -> None:
        """Load all models from Supabase into cache."""
        if not self._supabase:
            return
        
        try:
            response = self._supabase.table("models").select("*").execute()
            if response.data:
                with self._lock:
                    for model_data in response.data:
                        normalized = self._normalize_model_data(model_data)
                        self._models_cache[normalized["id"]] = normalized
                        if normalized.get("active"):
                            self._active_model_id = normalized["id"]
        except Exception as exc:
            raise RegistryError(f"Failed to load models from Supabase: {exc}") from exc

    def _normalize_model_data(self, model_data: dict[str, Any]) -> dict[str, Any]:
        data = dict(model_data)
        data.setdefault("architecture", data.get("framework") or "keras")
        data.setdefault("artifact_type", "full_model")
        data.setdefault("classes", [])
        data.setdefault("config", {})
        data.setdefault("run_metadata", {})
        data.setdefault("last_activation_status", None)
        data.setdefault("last_activation_error", None)
        data.setdefault("uploaded_by", None)
        data.setdefault("mlflow_run_id", None)
        
        # Reconstruct absolute path from relative path (handles backward compatibility)
        if "artifact_path" in data:
            stored_path = data["artifact_path"]
            abs_path = self._to_absolute_path(stored_path)
            data["artifact_path"] = str(abs_path)
        
        return data

    def _to_relative_path(self, absolute_path: Path) -> str:
        """Convert absolute path to relative path from artifact base."""
        try:
            return str(absolute_path.relative_to(self._artifact_base_path))
        except ValueError:
            # If path is not relative to base, return filename only
            return absolute_path.name

    def _to_absolute_path(self, stored_path: str) -> Path:
        """Convert stored path (relative or absolute) to absolute path."""
        path = Path(stored_path)
        
        # If already absolute, return as-is (backward compatibility)
        if path.is_absolute():
            return path
        
        # If relative, make it absolute relative to artifact base
        return self._artifact_base_path / path

    def _validate_registration_metadata(
        self,
        filename: str,
        architecture: Optional[str],
        artifact_type: str,
        classes: List[str],
        config: dict[str, Any],
    ) -> None:
        ext = Path(filename).suffix.lower()
        if ext not in SUPPORTED_ARTIFACT_EXTENSIONS:
            allowed = ", ".join(sorted(SUPPORTED_ARTIFACT_EXTENSIONS))
            raise RegistryError(f"Unsupported model artifact type. Allowed: {allowed}.")

        if artifact_type not in SUPPORTED_ARTIFACT_TYPES:
            raise RegistryError("Invalid artifact_type. Use 'full_model' or 'weights'.")

        if artifact_type == "weights":
            missing = []
            if not architecture:
                missing.append("architecture")
            if not classes:
                missing.append("classes")
            if not config:
                missing.append("config")
            if architecture == "mask_rcnn":
                num_classes = config.get("NUM_CLASSES")
                if num_classes is None:
                    missing.append("config.NUM_CLASSES")
                else:
                    try:
                        parsed_num_classes = int(num_classes)
                    except (TypeError, ValueError) as exc:
                        raise RegistryError("config.NUM_CLASSES must be an integer.") from exc
                    if parsed_num_classes != len(classes):
                        raise RegistryError("config.NUM_CLASSES must match the number of class names.")
            if missing:
                raise RegistryError(
                    "Weights-only artifacts require activation metadata: "
                    + ", ".join(missing)
                    + "."
                )

    def register_model(
        self,
        name: str,
        version: str,
        artifact_data: bytes,
        filename: str,
        framework: str,
        classes: List[str],
        description: Optional[str] = None,
        uploaded_by: Optional[str] = None,
        architecture: Optional[str] = None,
        artifact_type: str = "full_model",
        config: Optional[dict[str, Any]] = None,
    ) -> ModelRegistryResponse:
        """Register a new model in the registry."""
        config = config or {}
        architecture = architecture or framework
        self._validate_registration_metadata(
            filename=filename,
            architecture=architecture,
            artifact_type=artifact_type,
            classes=classes,
            config=config,
        )

        model_id = str(uuid.uuid4())
        
        # Save artifact to disk
        artifact_filename = f"{model_id}_{filename}"
        artifact_path = self._artifact_base_path / artifact_filename
        artifact_path.write_bytes(artifact_data)
        
        now = datetime.utcnow().isoformat()
        run_metadata = {
            "upload_event_id": str(uuid.uuid4()),
            "uploaded_at": now,
            "artifact_filename": filename,
            "artifact_size_bytes": len(artifact_data),
        }
        model_data = {
            "id": model_id,
            "name": name,
            "version": version,
            "description": description,
            "framework": framework,
            "architecture": architecture,
            "artifact_type": artifact_type,
            "artifact_path": self._to_relative_path(artifact_path),
            "classes": classes,
            "config": config,
            "active": False,
            "mlflow_run_id": run_metadata["upload_event_id"],
            "run_metadata": run_metadata,
            "last_activation_status": None,
            "last_activation_error": None,
            "created_at": now,
            "updated_at": now,
            "uploaded_by": uploaded_by,
        }
        
        # Store in Supabase
        if self._supabase:
            try:
                db_data = self._prepare_for_db(model_data)
                response = self._supabase.table("models").insert(db_data).execute()
                model_data = self._normalize_model_data(response.data[0] if response.data else model_data)
            except Exception as e:
                # Cleanup artifact if DB insert fails
                artifact_path.unlink(missing_ok=True)
                raise RegistryError(f"Failed to register model in database: {str(e)}")
        else:
            # Normalize even when not using supabase (for testing)
            model_data = self._normalize_model_data(model_data)
        
        # Cache the model
        with self._lock:
            self._models_cache[model_id] = model_data
        
        return ModelRegistryResponse(**model_data)

    def list_models(self) -> ModelListResponse:
        """Get all registered models."""
        with self._lock:
            models = [self._normalize_model_data(m) for m in self._models_cache.values()]
        
        return ModelListResponse(
            models=[ModelRegistryResponse(**m) for m in models],
            total=len(models),
        )

    def get_active_model(self) -> Optional[ModelRegistryResponse]:
        """Get the currently active model."""
        with self._lock:
            if not self._active_model_id or self._active_model_id not in self._models_cache:
                return None
            model_data = self._normalize_model_data(self._models_cache[self._active_model_id])
        
        return ModelRegistryResponse(**model_data)

    def get_model(self, model_id: str) -> ModelRegistryResponse:
        """Get a registered model by id."""
        with self._lock:
            if model_id not in self._models_cache:
                raise RegistryError(f"Model {model_id} not found")
            return ModelRegistryResponse(**self._normalize_model_data(self._models_cache[model_id]))

    def record_activation_failure(self, model_id: str, error: str) -> None:
        """Persist activation diagnostics without changing active model state."""
        with self._lock:
            if model_id not in self._models_cache:
                raise RegistryError(f"Model {model_id} not found")
            model_data = self._models_cache[model_id]
            model_data["last_activation_status"] = "failed"
            model_data["last_activation_error"] = error
            model_data["updated_at"] = datetime.utcnow().isoformat()
            self._update_model_in_db(model_data)

    def activate_model(self, model_id: str) -> ModelRegistryResponse:
        """Mark a previously loaded model active, deactivating all others."""
        with self._lock:
            if model_id not in self._models_cache:
                raise RegistryError(f"Model {model_id} not found")
            
            # Deactivate all other models
            for mid, model_data in self._models_cache.items():
                if mid != model_id:
                    model_data["active"] = False
                    self._update_model_in_db(model_data)
            
            # Activate the target model
            model_data = self._models_cache[model_id]
            model_data["active"] = True
            model_data["last_activation_status"] = "active"
            model_data["last_activation_error"] = None
            model_data["updated_at"] = datetime.utcnow().isoformat()
            self._update_model_in_db(model_data)
            self._active_model_id = model_id
        
        return ModelRegistryResponse(**self._normalize_model_data(model_data))

    def delete_model(self, model_id: str) -> None:
        """Delete a model and its artifact."""
        with self._lock:
            if model_id not in self._models_cache:
                raise RegistryError(f"Model {model_id} not found")
            
            model_data = self._models_cache[model_id]
            artifact_path = self._to_absolute_path(model_data["artifact_path"])
            
            # Delete artifact file
            try:
                artifact_path.unlink(missing_ok=True)
            except Exception as e:
                raise RegistryError(f"Failed to delete artifact: {str(e)}")
            
            # Delete from database
            if self._supabase:
                try:
                    self._supabase.table("models").delete().eq("id", model_id).execute()
                except Exception as e:
                    # Re-create artifact if DB delete fails
                    artifact_path.touch()
                    raise RegistryError(f"Failed to delete model from database: {str(e)}")
            
            # Remove from cache
            del self._models_cache[model_id]
            
            # If this was the active model, clear active state
            if self._active_model_id == model_id:
                self._active_model_id = None

    def _prepare_for_db(self, model_data: dict) -> dict:
        """Convert model data to database format (relative paths)."""
        db_data = dict(model_data)
        if "artifact_path" in db_data:
            db_data["artifact_path"] = self._to_relative_path(Path(db_data["artifact_path"]))
        return db_data

    def _update_model_in_db(self, model_data: dict) -> None:
        """Update model data in Supabase."""
        if not self._supabase:
            return
        
        try:
            db_data = self._prepare_for_db(model_data)
            self._supabase.table("models").update(db_data).eq("id", model_data["id"]).execute()
        except Exception as e:
            raise RegistryError(f"Failed to update model in database: {str(e)}")

    def get_artifact_path(self, model_id: str) -> Optional[Path]:
        """Get the artifact path for a model."""
        with self._lock:
            if model_id not in self._models_cache:
                return None
            model_data = self._models_cache[model_id]
            return self._to_absolute_path(model_data["artifact_path"])


# Global registry instance
_registry: Optional[ModelRegistry] = None


def get_model_registry(supabase_client=None) -> ModelRegistry:
    """Get or create the global model registry."""
    global _registry
    if _registry is None or (supabase_client is not None and _registry._supabase is None):
        _registry = ModelRegistry(supabase_client)
    return _registry
