from __future__ import annotations

from pathlib import Path
import logging

import numpy as np
import torch
from PIL import Image

from app.services import model_manager

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BASE_DIR / "models" / "model.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _schema_dict(model_record) -> dict:
    if hasattr(model_record, "model_dump"):
        return model_record.model_dump()
    return model_record.dict()


class ModelService:
    def __init__(self, model_path: Path, device: torch.device) -> None:
        self._model_path = model_path
        self._device = device
        self._manager = model_manager.MODEL_MANAGER
        self._registry = None
        self._bootstrap()

    def _bootstrap(self) -> None:
        # Try to load from registry first
        try:
            from app.services.registry import get_model_registry
            self._registry = get_model_registry()
            active_model = self._registry.get_active_model()
            if active_model:
                artifact_path = self._registry.get_artifact_path(active_model.id)
                if artifact_path and artifact_path.exists():
                    self._manager.load_from_path(
                        artifact_path,
                        self._device,
                        metadata=_schema_dict(active_model),
                    )
                    return
        except Exception:
            logger.exception("Failed to bootstrap active registry model.")
        
        # Fallback to legacy model path
        if self._model_path.exists():
            try:
                self._manager.load_from_path(self._model_path, self._device)
            except Exception:
                logger.exception("Failed to bootstrap legacy model from %s.", self._model_path)

    def _ensure_registry(self):
        if not self._registry:
            try:
                from app.services.registry import get_model_registry
                self._registry = get_model_registry()
            except Exception as exc:
                raise model_manager.ModelLoadError(
                    f"Failed to initialize model registry: {exc}"
                ) from exc
        return self._registry

    def load_registry_model(self, model_id: str) -> bool:
        """Load a registry model into memory without changing active state."""
        registry = self._ensure_registry()
        try:
            model_record = registry.get_model(model_id)
            artifact_path = registry.get_artifact_path(model_record.id)
            if not artifact_path:
                raise model_manager.ModelLoadError(
                    f"No artifact path was registered for model {model_record.id}."
                )
            if not artifact_path.exists():
                raise model_manager.ModelLoadError(
                    f"Artifact file does not exist for model {model_record.id}: {artifact_path}"
                )

            self._manager.load_from_path(
                artifact_path,
                self._device,
                metadata=_schema_dict(model_record),
            )
            return True
        except model_manager.ModelLoadError:
            raise
        except Exception as exc:
            raise model_manager.ModelLoadError(
                f"Unexpected error while loading registry model: {exc}"
            ) from exc

    def load_active_model_from_registry(self) -> bool:
        """Load the active model from the registry."""
        registry = self._ensure_registry()
        try:
            active_model = registry.get_active_model()
            if not active_model:
                raise model_manager.ModelLoadError("No active model was found in the registry.")

            artifact_path = registry.get_artifact_path(active_model.id)
            if not artifact_path:
                raise model_manager.ModelLoadError(
                    f"No artifact path was registered for model {active_model.id}."
                )
            if not artifact_path.exists():
                raise model_manager.ModelLoadError(
                    f"Artifact file does not exist for model {active_model.id}: {artifact_path}"
                )

            self._manager.load_from_path(
                artifact_path,
                self._device,
                metadata=_schema_dict(active_model),
            )
            return True
        except model_manager.ModelLoadError:
            raise
        except Exception as exc:
            raise model_manager.ModelLoadError(
                f"Unexpected error while loading active model: {exc}"
            ) from exc

    @property
    def device(self) -> torch.device:
        return self._device

    @property
    def class_names(self) -> list[str]:
        return self._manager.get_class_names()

    def status(self) -> dict:
        return self._manager.status()

    def load_from_upload(self, data: bytes, filename: str) -> str:
        return model_manager.load_model(data, filename, self._device)

    def predict_mask(self, image: Image.Image) -> np.ndarray:
        return model_manager.predict(image, self._device)

    def colorize_mask(self, mask: np.ndarray) -> Image.Image:
        return model_manager.colorize_mask(mask)

    def compose_overlay(self, original_image: Image.Image, mask: np.ndarray, alpha: float = 0.5) -> Image.Image:
        return model_manager.compose_overlay(original_image, mask, alpha)


_model_service = ModelService(MODEL_PATH, DEVICE)


def get_model_service() -> ModelService:
    return _model_service
