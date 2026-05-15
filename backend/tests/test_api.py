from __future__ import annotations

import base64
from datetime import datetime

from fastapi.testclient import TestClient
from PIL import Image
import io

from app.main import create_app
from app.schemas.registry import ModelRegistryResponse
from app.services.model_manager import ModelLoadError
import app.api.routes.registry as registry_routes


def test_health_ok(client) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model_loaded"] is False
    assert payload["classes"] == ["background", "few-layer", "bulk"]


def test_load_model_success(client) -> None:
    response = client.post(
        "/load_model",
        files={"file": ("model.keras", b"fake", "application/octet-stream")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_loaded"] is True
    assert payload["framework"] == "pytorch"


def test_load_model_invalid_extension(client) -> None:
    response = client.post(
        "/load_model",
        files={"file": ("model.txt", b"fake", "text/plain")},
    )

    assert response.status_code == 400
    assert "h5" in response.json().get("detail", "").lower() or "keras" in response.json().get("detail", "").lower()


def test_segment_no_model_loaded(client, image_bytes) -> None:
    response = client.post(
        "/segment",
        files={"file": ("image.png", image_bytes, "image/png")},
    )

    assert response.status_code == 503
    assert "model" in response.json().get("detail", "").lower()


def test_segment_success(client, image_bytes) -> None:
    client.post(
        "/load_model",
        files={"file": ("model.keras", b"fake", "application/octet-stream")},
    )

    response = client.post(
        "/segment",
        files={"file": ("image.png", image_bytes, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_loaded"] is True
    assert payload["mask_base64"]
    assert payload["segmented_base64"]
    assert payload["overlay_base64"]
    base64.b64decode(payload["mask_base64"])
    base64.b64decode(payload["segmented_base64"])
    base64.b64decode(payload["overlay_base64"])


def test_overlay_geometry_preserved(client, image_bytes) -> None:
    """Verify overlay has same dimensions as original image."""
    client.post(
        "/load_model",
        files={"file": ("model.keras", b"fake", "application/octet-stream")},
    )

    response = client.post(
        "/segment",
        files={"file": ("image.png", image_bytes, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    
    # Decode overlay and verify dimensions
    overlay_bytes = base64.b64decode(payload["overlay_base64"])
    overlay_image = Image.open(io.BytesIO(overlay_bytes))
    
    # Decode original image and verify they match
    original_image = Image.open(io.BytesIO(image_bytes))
    
    assert overlay_image.size == original_image.size, f"Overlay dimensions {overlay_image.size} don't match original {original_image.size}"
    assert overlay_image.mode == "RGB"


def test_activate_model_returns_loader_detail(monkeypatch) -> None:
    class StubRegistry:
        def get_model(self, model_id: str) -> ModelRegistryResponse:
            return ModelRegistryResponse(
                id=model_id,
                name="broken-model",
                version="1.0.0",
                description=None,
                framework="keras",
                architecture="keras",
                artifact_type="full_model",
                artifact_path="missing.keras",
                classes=[],
                config={},
                active=True,
                mlflow_run_id=None,
                run_metadata={},
                last_activation_status=None,
                last_activation_error=None,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                uploaded_by=None,
            )

        def activate_model(self, model_id: str) -> ModelRegistryResponse:
            return self.get_model(model_id)

        def get_artifact_path(self, model_id: str):
            return None

        def record_activation_failure(self, model_id: str, error: str) -> None:
            self.error = error

    class FailingModelService:
        def load_registry_model(self, model_id: str) -> bool:
            raise ModelLoadError("TensorFlow is required to load .keras models.")

    monkeypatch.setattr(registry_routes, "get_model_service", lambda: FailingModelService())

    app = create_app()
    app.dependency_overrides[registry_routes.get_registry] = lambda: StubRegistry()
    client = TestClient(app)

    response = client.post("/registry/models/model-1/activate")

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Model activation failed: "
        "TensorFlow is required to load .keras models."
    )


def test_upload_weights_with_empty_metadata_reports_missing_fields(monkeypatch) -> None:
    class StubRegistry:
        def register_model(self, **kwargs):
            from app.services.registry import RegistryError

            raise RegistryError(
                "Weights-only artifacts require activation metadata: classes, config, config.NUM_CLASSES."
            )

    app = create_app()
    app.dependency_overrides[registry_routes.get_registry] = lambda: StubRegistry()
    client = TestClient(app)

    response = client.post(
        "/registry/models/upload",
        data={
            "name": "graphene",
            "version": "1.0",
            "framework": "keras",
            "architecture": "mask_rcnn",
            "artifact_type": "weights",
            "classes": "",
            "config": "",
        },
        files={"file": ("graphene_mask_rcnn_tdm_0120.h5", b"weights", "application/octet-stream")},
    )

    assert response.status_code == 400
    assert "weights-only artifacts require" in response.json()["detail"].lower()
