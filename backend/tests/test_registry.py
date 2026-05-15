from __future__ import annotations

import base64
import pytest
from pathlib import Path
import tempfile
import numpy as np
from PIL import Image

from app.services import model_manager
from app.services.registry import ModelRegistry, RegistryError


@pytest.fixture
def temp_models_dir():
    """Create a temporary directory for model artifacts."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def registry(temp_models_dir):
    """Create a test registry without Supabase."""
    return ModelRegistry(supabase_client=None, artifact_base_path=temp_models_dir)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, store, fail_insert=False):
        self.store = store
        self.fail_insert = fail_insert
        self.action = None
        self.payload = None
        self.filter_id = None

    def select(self, *_args):
        self.action = "select"
        return self

    def insert(self, payload):
        if self.fail_insert:
            raise RuntimeError("supabase insert unavailable")
        self.action = "insert"
        self.payload = dict(payload)
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = dict(payload)
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, field, value):
        if field == "id":
            self.filter_id = value
        return self

    def execute(self):
        if self.action == "select":
            return FakeResponse(list(self.store.values()))
        if self.action == "insert":
            self.store[self.payload["id"]] = dict(self.payload)
            return FakeResponse([self.store[self.payload["id"]]])
        if self.action == "update":
            self.store[self.filter_id] = dict(self.payload)
            return FakeResponse([self.store[self.filter_id]])
        if self.action == "delete":
            self.store.pop(self.filter_id, None)
            return FakeResponse([])
        return FakeResponse([])


class FakeSupabase:
    def __init__(self, initial=None, fail_insert=False):
        self.store = {item["id"]: dict(item) for item in (initial or [])}
        self.fail_insert = fail_insert

    def table(self, name):
        assert name == "models"
        return FakeTable(self.store, fail_insert=self.fail_insert)


def test_register_model_success(registry, temp_models_dir):
    """Test successful model registration."""
    model_data = b"fake model data"
    
    response = registry.register_model(
        name="test_model",
        version="1.0.0",
        artifact_data=model_data,
        filename="model.keras",
        framework="keras",
        classes=["class1", "class2"],
        description="Test model",
    )
    
    assert response.id
    assert response.name == "test_model"
    assert response.version == "1.0.0"
    assert response.framework == "keras"
    assert response.architecture == "keras"
    assert response.artifact_type == "full_model"
    assert response.config == {}
    assert response.classes == ["class1", "class2"]
    assert response.active is False
    assert response.run_metadata["artifact_size_bytes"] == len(model_data)
    
    # Verify artifact was saved
    artifact_path = Path(response.artifact_path)
    assert artifact_path.exists()
    assert artifact_path.read_bytes() == model_data


def test_list_models(registry):
    """Test listing all models."""
    # Register multiple models
    model_ids = []
    for i in range(3):
        response = registry.register_model(
            name=f"model_{i}",
            version="1.0.0",
            artifact_data=b"data",
            filename=f"model_{i}.keras",
            framework="keras",
            classes=[],
        )
        model_ids.append(response.id)
    
    # List models
    result = registry.list_models()
    assert result.total == 3
    assert len(result.models) == 3
    assert set(m.id for m in result.models) == set(model_ids)


def test_get_active_model_none(registry):
    """Test getting active model when none is active."""
    active = registry.get_active_model()
    assert active is None


def test_activate_model_single(registry):
    """Test activating a single model."""
    # Register a model
    response = registry.register_model(
        name="model_1",
        version="1.0.0",
        artifact_data=b"data1",
        filename="model_1.keras",
        framework="keras",
        classes=["a", "b"],
    )
    model_id = response.id
    
    # Activate it
    activated = registry.activate_model(model_id)
    assert activated.active is True
    assert activated.id == model_id
    
    # Verify it's the active model
    active = registry.get_active_model()
    assert active.id == model_id


def test_activate_model_atomic(registry):
    """Test that activation is atomic (only one model active at a time)."""
    # Register two models
    model1 = registry.register_model(
        name="model_1",
        version="1.0.0",
        artifact_data=b"data1",
        filename="model_1.keras",
        framework="keras",
        classes=[],
    )
    model2 = registry.register_model(
        name="model_2",
        version="1.0.0",
        artifact_data=b"data2",
        filename="model_2.keras",
        framework="keras",
        classes=[],
    )
    
    # Activate first model
    registry.activate_model(model1.id)
    active = registry.get_active_model()
    assert active.id == model1.id
    
    # Activate second model
    registry.activate_model(model2.id)
    active = registry.get_active_model()
    assert active.id == model2.id
    
    # List and verify only model2 is active
    all_models = registry.list_models()
    active_count = sum(1 for m in all_models.models if m.active)
    assert active_count == 1


def test_activate_nonexistent_model(registry):
    """Test activating a model that doesn't exist."""
    with pytest.raises(RegistryError):
        registry.activate_model("nonexistent_id")


def test_delete_model_success(registry):
    """Test successful model deletion."""
    # Register a model
    response = registry.register_model(
        name="model_to_delete",
        version="1.0.0",
        artifact_data=b"data",
        filename="model.keras",
        framework="keras",
        classes=[],
    )
    model_id = response.id
    artifact_path = Path(response.artifact_path)
    
    # Verify it exists
    assert artifact_path.exists()
    
    # Delete it
    registry.delete_model(model_id)
    
    # Verify it's gone
    assert not artifact_path.exists()
    result = registry.list_models()
    assert result.total == 0


def test_delete_nonexistent_model(registry):
    """Test deleting a model that doesn't exist."""
    with pytest.raises(RegistryError):
        registry.delete_model("nonexistent_id")


def test_delete_active_model(registry):
    """Test that deleting the active model clears the active state."""
    # Register and activate a model
    response = registry.register_model(
        name="model_to_delete",
        version="1.0.0",
        artifact_data=b"data",
        filename="model.keras",
        framework="keras",
        classes=[],
    )
    model_id = response.id
    registry.activate_model(model_id)
    
    # Verify it's active
    active = registry.get_active_model()
    assert active is not None
    
    # Delete it
    registry.delete_model(model_id)
    
    # Verify active model is now None
    active = registry.get_active_model()
    assert active is None


def test_get_artifact_path(registry):
    """Test getting artifact path for a model."""
    response = registry.register_model(
        name="model",
        version="1.0.0",
        artifact_data=b"data",
        filename="model.keras",
        framework="keras",
        classes=[],
    )
    
    # Get artifact path
    path = registry.get_artifact_path(response.id)
    assert path is not None
    assert path.exists()
    assert path.suffix == ".keras"


def test_get_artifact_path_nonexistent(registry):
    """Test getting artifact path for nonexistent model."""
    path = registry.get_artifact_path("nonexistent_id")
    assert path is None


def test_register_full_keras_model_with_supabase_metadata(temp_models_dir):
    supabase = FakeSupabase()
    registry = ModelRegistry(supabase_client=supabase, artifact_base_path=temp_models_dir)

    response = registry.register_model(
        name="keras-full",
        version="1.0.0",
        artifact_data=b"keras-data",
        filename="model.keras",
        framework="keras",
        architecture="keras",
        artifact_type="full_model",
        classes=["background", "flake"],
        config={},
    )

    stored = supabase.store[response.id]
    assert stored["architecture"] == "keras"
    assert stored["artifact_type"] == "full_model"
    assert stored["run_metadata"]["artifact_filename"] == "model.keras"
    # Verify artifact exists using the registry method (handles relative paths)
    artifact_path = registry.get_artifact_path(response.id)
    assert artifact_path is not None
    assert artifact_path.exists()


def test_register_mask_rcnn_weights_with_valid_config(registry):
    response = registry.register_model(
        name="mask-weights",
        version="1.0.0",
        artifact_data=b"weights",
        filename="mask_rcnn_custom.h5",
        framework="keras",
        architecture="mask_rcnn",
        artifact_type="weights",
        classes=["background", "few-layer", "bulk"],
        config={"NUM_CLASSES": 3, "BACKBONE": "resnet50"},
    )

    assert response.architecture == "mask_rcnn"
    assert response.artifact_type == "weights"
    assert response.config["NUM_CLASSES"] == 3


def test_reject_weights_without_architecture_or_config(registry):
    with pytest.raises(RegistryError) as exc:
        registry.register_model(
            name="bad-weights",
            version="1.0.0",
            artifact_data=b"weights",
            filename="weights.h5",
            framework="keras",
            artifact_type="weights",
            classes=[],
            config={},
        )

    assert "weights-only artifacts require" in str(exc.value).lower()


def test_mask_rcnn_activation_constructs_model_and_loads_weights(monkeypatch, temp_models_dir):
    artifact_path = temp_models_dir / "mask_rcnn_custom.h5"
    artifact_path.write_bytes(b"weights")
    calls = {}

    class FakeMaskRCNN:
        def __init__(self, mode, model_dir, config):
            calls["mode"] = mode
            calls["model_dir"] = model_dir
            calls["num_classes"] = config.NUM_CLASSES

        def load_weights(self, path, by_name):
            calls["weights_path"] = path
            calls["by_name"] = by_name

        def detect(self, images, verbose=0):
            return [{"masks": [], "class_ids": []}]

    import app.models.mrcnn.model as mrcnn_model

    monkeypatch.setattr(mrcnn_model, "MaskRCNN", FakeMaskRCNN, raising=False)
    manager = model_manager.ModelManager()

    loaded = manager.load_from_path(
        artifact_path,
        device="cpu",
        metadata={
            "framework": "keras",
            "architecture": "mask_rcnn",
            "artifact_type": "weights",
            "classes": ["background", "few-layer", "bulk"],
            "config": {"NUM_CLASSES": 3},
        },
    )

    assert loaded is True
    assert calls["mode"] == "inference"
    assert calls["weights_path"] == str(artifact_path)
    assert calls["by_name"] is True


def test_activation_fails_for_incompatible_mask_rcnn_config(temp_models_dir):
    artifact_path = temp_models_dir / "mask_rcnn_custom.h5"
    artifact_path.write_bytes(b"weights")
    manager = model_manager.ModelManager()

    with pytest.raises(model_manager.ModelLoadError) as exc:
        manager.load_from_path(
            artifact_path,
            device="cpu",
            metadata={
                "framework": "keras",
                "architecture": "mask_rcnn",
                "artifact_type": "weights",
                "classes": ["background", "few-layer", "bulk"],
                "config": {"NUM_CLASSES": 2},
            },
        )

    assert "num_classes" in str(exc.value).lower()


def test_missing_artifact_path_returns_clear_load_error(temp_models_dir):
    manager = model_manager.ModelManager()

    loaded = manager.load_from_path(
        temp_models_dir / "missing.keras",
        device="cpu",
        metadata={"artifact_type": "full_model", "framework": "keras"},
    )

    assert loaded is False


def test_keras_adapter_uses_predict_for_inference():
    class FakeKerasModel:
        def __call__(self, *args, **kwargs):
            raise AssertionError("Direct __call__ should not be used for inference")

        def predict(self, batch, verbose=0):
            assert verbose == 0
            assert batch.shape == (1, 224, 224, 3)
            return np.zeros((1, 224, 224, 3), dtype=np.float32)

    adapter = model_manager.KerasModelAdapter(FakeKerasModel())
    image = Image.new("RGB", (64, 64), color=(255, 255, 255))

    mask = adapter.predict(image, device="cpu", preprocess=model_manager.PreprocessConfig())

    assert mask.shape == (64, 64)
    assert mask.dtype == np.uint8


def test_supabase_insert_failure_cleans_up_local_artifact(temp_models_dir):
    registry = ModelRegistry(
        supabase_client=FakeSupabase(fail_insert=True),
        artifact_base_path=temp_models_dir,
    )

    with pytest.raises(RegistryError):
        registry.register_model(
            name="cleanup",
            version="1.0.0",
            artifact_data=b"model",
            filename="cleanup.keras",
            framework="keras",
            classes=[],
        )

    assert list(temp_models_dir.iterdir()) == []
