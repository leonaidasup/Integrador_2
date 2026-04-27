from __future__ import annotations

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.services.model_manager import ModelPredictError, colorize_mask

import app.api.routes.health as health_routes
import app.api.routes.model as model_routes


class StubModelService:
    def __init__(self) -> None:
        self.loaded = False
        self.class_names = ["background", "few-layer", "bulk"]
        self.device = "cpu"

    def status(self) -> dict:
        return {
            "loaded": self.loaded,
            "framework": "pytorch" if self.loaded else None,
            "input_size": 224,
            "last_error": None,
        }

    def load_from_upload(self, data: bytes, filename: str) -> str:
        self.loaded = True
        return "pytorch"

    def predict_mask(self, image: Image.Image) -> np.ndarray:
        if not self.loaded:
            raise ModelPredictError("No model loaded. Upload one via /load_model.")
        return np.zeros((image.size[1], image.size[0]), dtype=np.uint8)

    def colorize_mask(self, mask: np.ndarray) -> Image.Image:
        return colorize_mask(mask)


@pytest.fixture
def model_service_stub() -> StubModelService:
    return StubModelService()


@pytest.fixture
def client(model_service_stub: StubModelService, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(model_routes, "get_model_service", lambda: model_service_stub)
    monkeypatch.setattr(health_routes, "get_model_service", lambda: model_service_stub)
    app = create_app()
    return TestClient(app)


@pytest.fixture
def image_bytes() -> bytes:
    image = Image.new("RGB", (8, 8), color=(255, 0, 0))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
