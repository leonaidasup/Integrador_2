from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from PIL import Image

from app.services import model_manager

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BASE_DIR / "models" / "model.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class ModelService:
    def __init__(self, model_path: Path, device: torch.device) -> None:
        self._model_path = model_path
        self._device = device
        self._manager = model_manager.MODEL_MANAGER
        self._bootstrap()

    def _bootstrap(self) -> None:
        if self._model_path.exists():
            try:
                self._manager.load_from_path(self._model_path, self._device)
            except Exception:
                pass

    @property
    def device(self) -> torch.device:
        return self._device

    @property
    def class_names(self) -> list[str]:
        return model_manager.CLASS_NAMES

    def status(self) -> dict:
        return self._manager.status()

    def load_from_upload(self, data: bytes, filename: str) -> str:
        return model_manager.load_model(data, filename, self._device)

    def predict_mask(self, image: Image.Image) -> np.ndarray:
        return model_manager.predict(image, self._device)

    def colorize_mask(self, mask: np.ndarray) -> Image.Image:
        return model_manager.colorize_mask(mask)


_model_service = ModelService(MODEL_PATH, DEVICE)


def get_model_service() -> ModelService:
    return _model_service
