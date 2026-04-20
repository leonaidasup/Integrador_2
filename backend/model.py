from __future__ import annotations

import io
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

# Class mapping:
# 0 -> background
# 1 -> few-layer
# 2 -> bulk
CLASS_NAMES = ["background", "few-layer", "bulk"]
CLASS_COLORS = {
    0: (0, 0, 0),
    1: (0, 170, 255),
    2: (255, 140, 0),
}


@dataclass(frozen=True)
class PreprocessConfig:
    size: int = 224


class ModelLoadError(RuntimeError):
    pass


class ModelPredictError(RuntimeError):
    pass


def _to_tensor(image: Image.Image, size: int) -> torch.Tensor:
    """Convert PIL image to normalized tensor with shape [1, 3, H, W]."""
    image_rgb = image.convert("RGB").resize((size, size), Image.BILINEAR)
    arr = np.array(image_rgb, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    return torch.from_numpy(arr).unsqueeze(0)


def _to_numpy_batch(image: Image.Image, size: int) -> np.ndarray:
    """Convert PIL image to normalized numpy batch with shape [1, H, W, 3]."""
    image_rgb = image.convert("RGB").resize((size, size), Image.BILINEAR)
    arr = np.array(image_rgb, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)


def _resize_mask(mask_small: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    mask_img = Image.fromarray(mask_small, mode="L").resize(size, Image.NEAREST)
    return np.array(mask_img, dtype=np.uint8)


def _maybe_sigmoid(values: np.ndarray) -> np.ndarray:
    if values.min() >= 0.0 and values.max() <= 1.0:
        return values
    clipped = np.clip(values, -30.0, 30.0)
    return 1.0 / (1.0 + np.exp(-clipped))


class ModelAdapter:
    framework: str = "unknown"

    def predict(
        self, image: Image.Image, device: torch.device, preprocess: PreprocessConfig
    ) -> np.ndarray:
        raise NotImplementedError


class TorchModelAdapter(ModelAdapter):
    framework = "pytorch"

    def __init__(self, model: nn.Module) -> None:
        self._model = model
        self._model.eval()

    def predict(
        self, image: Image.Image, device: torch.device, preprocess: PreprocessConfig
    ) -> np.ndarray:
        x = _to_tensor(image, preprocess.size).to(device)

        with torch.no_grad():
            out = self._model(x)

        if isinstance(out, dict) and "out" in out:
            out = out["out"]

        if not isinstance(out, torch.Tensor) or out.ndim != 4:
            raise ModelPredictError("PyTorch model output must be a 4D tensor.")

        if out.shape[1] == 1:
            prob = torch.sigmoid(out)[0, 0].cpu().numpy()
            mask_small = np.digitize(prob, bins=[0.33, 0.66]).astype(np.uint8)
        else:
            mask_small = torch.argmax(out, dim=1)[0].cpu().numpy().astype(np.uint8)

        return _resize_mask(mask_small, image.size)


class KerasModelAdapter(ModelAdapter):
    framework = "keras"

    def __init__(self, model: object) -> None:
        self._model = model

    def predict(
        self, image: Image.Image, device: torch.device, preprocess: PreprocessConfig
    ) -> np.ndarray:
        batch = _to_numpy_batch(image, preprocess.size)
        pred = self._model(batch, training=False)
        pred_np = np.asarray(pred)

        if pred_np.ndim != 4:
            raise ModelPredictError("Keras model output must be a 4D tensor.")

        if pred_np.shape[-1] in (1, 2, 3, 4):
            channels_last = True
        elif pred_np.shape[1] in (1, 2, 3, 4):
            channels_last = False
        else:
            channels_last = True

        if not channels_last:
            pred_np = np.transpose(pred_np, (0, 2, 3, 1))

        if pred_np.shape[-1] == 1:
            prob = _maybe_sigmoid(pred_np[0, ..., 0])
            mask_small = np.digitize(prob, bins=[0.33, 0.66]).astype(np.uint8)
        else:
            mask_small = np.argmax(pred_np[0], axis=-1).astype(np.uint8)

        return _resize_mask(mask_small, image.size)


def _load_pytorch_model(data: bytes, device: torch.device) -> TorchModelAdapter:
    try:
        buffer = io.BytesIO(data)
        model = torch.jit.load(buffer, map_location=device)
        model.eval()
        return TorchModelAdapter(model)
    except Exception as exc:
        raise ModelLoadError(
            "Failed to load .pth. Provide a TorchScript model saved with "
            "torch.jit.save()."
        ) from exc


def _load_keras_model(data: bytes) -> KerasModelAdapter:
    try:
        import tensorflow as tf
    except Exception as exc:
        raise ModelLoadError("TensorFlow is required to load .keras models.") from exc

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".keras") as tmp_file:
            tmp_file.write(data)
            temp_path = tmp_file.name

        model = tf.keras.models.load_model(temp_path, compile=False)
        return KerasModelAdapter(model)
    except Exception as exc:
        raise ModelLoadError(
            "Failed to load .keras. Ensure it is a Keras model and includes any custom layers."
        ) from exc
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


class ModelManager:
    def __init__(self, preprocess: Optional[PreprocessConfig] = None) -> None:
        self._lock = Lock()
        self._adapter: Optional[ModelAdapter] = None
        self._framework: Optional[str] = None
        self._preprocess = preprocess or PreprocessConfig()
        self._last_error: Optional[str] = None

    def load_from_bytes(
        self, data: bytes, filename: str, device: torch.device
    ) -> str:
        if not data:
            raise ModelLoadError("Uploaded file is empty.")

        ext = Path(filename).suffix.lower()
        if ext == ".pth":
            adapter = _load_pytorch_model(data, device)
        elif ext == ".keras":
            adapter = _load_keras_model(data)
        else:
            raise ModelLoadError("Unsupported model format. Use .pth or .keras.")

        with self._lock:
            self._adapter = adapter
            self._framework = adapter.framework
            self._last_error = None

        return adapter.framework

    def load_from_path(self, model_path: Path, device: torch.device) -> bool:
        if not model_path.exists():
            return False

        data = model_path.read_bytes()
        self.load_from_bytes(data, model_path.name, device)
        return True

    def predict(self, image: Image.Image, device: torch.device) -> np.ndarray:
        with self._lock:
            adapter = self._adapter

        if adapter is None:
            raise ModelPredictError("No model loaded. Upload one via /load_model.")

        return adapter.predict(image, device, self._preprocess)

    def status(self) -> dict:
        with self._lock:
            adapter = self._adapter
            framework = self._framework

        return {
            "loaded": adapter is not None,
            "framework": framework,
            "input_size": self._preprocess.size,
            "last_error": self._last_error,
        }


MODEL_MANAGER = ModelManager()


def load_model(data: bytes, filename: str, device: torch.device) -> str:
    return MODEL_MANAGER.load_from_bytes(data, filename, device)


def predict(image: Image.Image, device: torch.device) -> np.ndarray:
    return MODEL_MANAGER.predict(image, device)


def colorize_mask(mask: np.ndarray) -> Image.Image:
    """Convert class mask to RGB visualization."""
    h, w = mask.shape
    color = np.zeros((h, w, 3), dtype=np.uint8)
    for class_id, rgb in CLASS_COLORS.items():
        color[mask == class_id] = rgb
    return Image.fromarray(color, mode="RGB")
