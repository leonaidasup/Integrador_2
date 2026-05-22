from __future__ import annotations

import io
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Optional

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


def _letterbox(image: Image.Image, size: int) -> tuple["Image.Image", tuple[int, int, int, int]]:
    """
    Replicate A.LongestMaxSize + A.PadIfNeeded:
    - Scale so the longest side == size (preserve aspect ratio, CUBIC interpolation)
    - Pad the shorter side with zeros to reach (size, size)
    Returns the padded image and (pad_left, pad_top, pad_right, pad_bottom).
    """
    w, h = image.size
    scale = size / max(w, h)
    new_w = round(w * scale)
    new_h = round(h * scale)
    resized = image.resize((new_w, new_h), Image.BICUBIC)

    pad_left  = (size - new_w) // 2
    pad_top   = (size - new_h) // 2
    pad_right  = size - new_w - pad_left
    pad_bottom = size - new_h - pad_top

    padded = Image.new("RGB", (size, size), (0, 0, 0))
    padded.paste(resized, (pad_left, pad_top))
    return padded, (pad_left, pad_top, pad_right, pad_bottom)


def _remove_padding(
    mask: np.ndarray,
    padding: tuple[int, int, int, int],
    original_size: tuple[int, int],
) -> np.ndarray:
    """
    Crop the padding that was added during letterbox, then resize to original_size.
    padding = (pad_left, pad_top, pad_right, pad_bottom)
    original_size = (width, height)
    """
    pad_left, pad_top, pad_right, pad_bottom = padding
    h, w = mask.shape
    crop = mask[
        pad_top  : h - pad_bottom if pad_bottom else h,
        pad_left : w - pad_right  if pad_right  else w,
    ]
    return _resize_mask(crop, original_size)


def _to_tensor(image: Image.Image, size: int) -> tuple[torch.Tensor, tuple[int, int, int, int]]:
    """Convert PIL image to normalized tensor [1,3,H,W] using letterbox. Returns (tensor, padding)."""
    image_rgb = image.convert("RGB")
    padded, padding = _letterbox(image_rgb, size)
    arr = np.array(padded, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    return torch.from_numpy(arr).unsqueeze(0), padding


def _to_numpy_batch(image: Image.Image, size: int) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Convert PIL image to normalized numpy batch [1,H,W,3] using letterbox. Returns (batch, padding)."""
    image_rgb = image.convert("RGB")
    padded, padding = _letterbox(image_rgb, size)
    arr = np.array(padded, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0), padding


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
    classes: list[str] = CLASS_NAMES

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
        x, padding = _to_tensor(image, preprocess.size)
        x = x.to(device)

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

        return _remove_padding(mask_small, padding, image.size)


class KerasModelAdapter(ModelAdapter):
    framework = "keras"

    def __init__(self, model: object) -> None:
        self._model = model

    def predict(
        self, image: Image.Image, device: torch.device, preprocess: PreprocessConfig
    ) -> np.ndarray:
        batch, padding = _to_numpy_batch(image, preprocess.size)
        pred_np = np.asarray(self._model.predict(batch, verbose=0))

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

        return _remove_padding(mask_small, padding, image.size)


class MaskRCNNModelAdapter(ModelAdapter):
    framework = "mask_rcnn"

    def __init__(self, model: object, classes: list[str], preprocess_size: int) -> None:
        self._model = model
        self.classes = classes
        self._preprocess_size = preprocess_size

    def predict(
        self, image: Image.Image, device: torch.device, preprocess: PreprocessConfig
    ) -> np.ndarray:
        image_rgb = image.convert("RGB")
        result = self._model.detect([np.array(image_rgb)], verbose=0)[0]
        masks = result.get("masks")
        class_ids = result.get("class_ids")

        if masks is None or class_ids is None:
            raise ModelPredictError("Mask R-CNN result must include masks and class_ids.")

        mask = np.zeros((image_rgb.height, image_rgb.width), dtype=np.uint8)
        for index, class_id in enumerate(class_ids):
            if index < masks.shape[-1]:
                mask[masks[:, :, index].astype(bool)] = int(class_id)
        return mask


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


# ── Supported SMP architectures ──────────────────────────────────────────────
_SMP_ARCHITECTURES: dict[str, str] = {
    "unet":           "Unet",
    "unetplusplus":   "UnetPlusPlus",
    "unet++":         "UnetPlusPlus",
    "fpn":            "FPN",
    "deeplabv3plus":  "DeepLabV3Plus",
    "deeplabv3":      "DeepLabV3",
    "pspnet":         "PSPNet",
    "pan":            "PAN",
    "linknet":        "Linknet",
    "manet":          "MAnet",
}


def _load_smp_state_dict(
    data: bytes,
    architecture: str,
    encoder: str,
    classes: int,
    device: torch.device,
    in_channels: int = 3,
) -> TorchModelAdapter:
    """Load a segmentation_models_pytorch model from a state_dict checkpoint."""
    try:
        import segmentation_models_pytorch as smp
    except ImportError as exc:
        raise ModelLoadError(
            "segmentation-models-pytorch is not installed. "
            "Run: pip install segmentation-models-pytorch"
        ) from exc

    arch_key = architecture.lower().replace("-", "").replace("_", "")
    smp_class_name = _SMP_ARCHITECTURES.get(arch_key)
    if not smp_class_name:
        supported = ", ".join(_SMP_ARCHITECTURES.keys())
        raise ModelLoadError(
            f"Architecture '{architecture}' is not supported for state_dict loading. "
            f"Supported: {supported}. "
            "Export as TorchScript instead: torch.jit.save(torch.jit.script(model), path)"
        )

    try:
        smp_class = getattr(smp, smp_class_name)
        model = smp_class(
            encoder_name=encoder,
            encoder_weights="imagenet",
            in_channels=in_channels,
            classes=classes,
        )
    except Exception as exc:
        raise ModelLoadError(
            f"Failed to instantiate {smp_class_name} with encoder '{encoder}' "
            f"and {classes} classes: {exc}"
        ) from exc

    # Load checkpoint — supports both raw state_dict and wrapped {"model_state_dict": ...}
    buffer = io.BytesIO(data)
    try:
        checkpoint = torch.load(buffer, map_location=device, weights_only=False)
    except Exception as exc:
        raise ModelLoadError(f"Failed to read .pt/.pth file: {exc}") from exc

    if isinstance(checkpoint, dict):
        state_dict = (
            checkpoint.get("model_state_dict")
            or checkpoint.get("state_dict")
            or checkpoint.get("model")
            or checkpoint  # raw state_dict
        )
    else:
        raise ModelLoadError(
            "Unexpected checkpoint format. Expected a dict with 'model_state_dict' or 'state_dict'."
        )

    try:
        model.load_state_dict(state_dict, strict=True)
    except RuntimeError as exc:
        raise ModelLoadError(
            f"State dict does not match the model architecture. "
            f"Verify encoder, architecture and number of classes. Detail: {exc}"
        ) from exc

    model.to(device).eval()
    return TorchModelAdapter(model)


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
            "Failed to load .keras/.h5 model. Ensure it is a valid Keras model and includes any custom layers."
        ) from exc
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def _infer_framework(filename: str, architecture: Optional[str], framework: Optional[str]) -> str:
    if architecture == "mask_rcnn":
        return "mask_rcnn"
    if framework:
        return framework
    ext = Path(filename).suffix.lower()
    if ext in {".h5", ".keras"}:
        return "keras"
    if ext in {".pth", ".pt"}:
        return "pytorch"
    return "unknown"


def _load_full_model_from_path(
    model_path: Path, device: torch.device, framework: Optional[str]
) -> ModelAdapter:
    data = model_path.read_bytes()
    ext = model_path.suffix.lower()
    if framework == "pytorch" or ext in {".pth", ".pt"}:
        return _load_pytorch_model(data, device)
    if framework in {None, "keras", "tensorflow"} or ext in {".h5", ".keras"}:
        return _load_keras_model(data)
    raise ModelLoadError(f"Unsupported full-model framework '{framework}'.")


def _build_mask_rcnn_config(config: dict[str, Any], classes: list[str]) -> object:
    try:
        from app.models.mrcnn.config import Config
    except Exception as exc:
        raise ModelLoadError("Mask R-CNN config support is unavailable.") from exc

    if not classes:
        raise ModelLoadError("Mask R-CNN activation requires class names.")

    expected_num_classes = int(config.get("NUM_CLASSES", len(classes)))
    if expected_num_classes != len(classes):
        raise ModelLoadError(
            "Mask R-CNN NUM_CLASSES must match the number of class names, including background."
        )

    allowed_keys = {
        "NAME",
        "NUM_CLASSES",
        "BACKBONE",
        "IMAGE_MIN_DIM",
        "IMAGE_MAX_DIM",
        "IMAGE_RESIZE_MODE",
        "GPU_COUNT",
        "IMAGES_PER_GPU",
        "DETECTION_MIN_CONFIDENCE",
        "DETECTION_NMS_THRESHOLD",
        "DETECTION_MAX_INSTANCES",
    }
    attrs = {
        "NAME": config.get("NAME", "registry_mask_rcnn"),
        "NUM_CLASSES": expected_num_classes,
        "GPU_COUNT": 1,
        "IMAGES_PER_GPU": 1,
    }
    for key, value in config.items():
        if key in allowed_keys:
            attrs[key] = value

    return type("RegistryMaskRCNNConfig", (Config,), attrs)()


def _load_mask_rcnn_weights(model_path: Path, config: dict[str, Any], classes: list[str]) -> MaskRCNNModelAdapter:
    if model_path.suffix.lower() != ".h5":
        raise ModelLoadError("Mask R-CNN weights must be uploaded as a .h5 artifact.")

    runtime_config = _build_mask_rcnn_config(config, classes)
    model_dir = str(model_path.parent / "mrcnn_logs")
    try:
        from app.models.mrcnn.model import MaskRCNN
    except (ImportError, AttributeError):
        try:
            from mrcnn.model import MaskRCNN
        except Exception as exc:
            raise ModelLoadError(
                "Mask R-CNN runtime is unavailable. "
                "backend/app/models/mrcnn/model.py could not import MaskRCNN, "
                "and no external mrcnn.model package is installed. Check that "
                "the vendored Mask R-CNN files use app.models.mrcnn package imports."
            ) from exc
    except Exception as exc:
        raise ModelLoadError(f"Mask R-CNN runtime failed to import: {exc}") from exc

    try:
        model = MaskRCNN(mode="inference", model_dir=model_dir, config=runtime_config)
        model.load_weights(str(model_path), by_name=True)
    except Exception as exc:
        raise ModelLoadError(f"Failed to load Mask R-CNN weights: {exc}") from exc

    image_size = int(getattr(runtime_config, "IMAGE_MAX_DIM", 1024))
    return MaskRCNNModelAdapter(model, classes=classes, preprocess_size=image_size)


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
        if ext == ".h5" or ext == ".keras":
            adapter = _load_keras_model(data)
        else:
            raise ModelLoadError("Unsupported model format. Use .h5 or .keras.")

        with self._lock:
            self._adapter = adapter
            self._framework = adapter.framework
            self._last_error = None

        return adapter.framework

    def load_from_path(
        self,
        model_path: Path,
        device: torch.device,
        metadata: Optional[dict[str, Any]] = None,
    ) -> bool:
        if not model_path.exists():
            return False

        metadata = metadata or {}
        artifact_type = metadata.get("artifact_type", "full_model")
        architecture = metadata.get("architecture")
        framework = _infer_framework(model_path.name, architecture, metadata.get("framework"))
        classes = metadata.get("classes") or CLASS_NAMES
        config = metadata.get("config") or {}

        try:
            if artifact_type == "weights":
                if architecture == "mask_rcnn":
                    adapter = _load_mask_rcnn_weights(model_path, config, classes)
                elif framework in {"keras", "tensorflow"} or model_path.suffix.lower() in {".h5", ".keras"}:
                    adapter = _load_full_model_from_path(model_path, device, "keras")
                    adapter.classes = classes
                elif framework == "pytorch" or model_path.suffix.lower() in {".pth", ".pt"}:
                    # Use SMP state_dict loader — requires architecture + encoder in metadata
                    encoder_name = config.get("encoder", "resnet34")
                    n_classes    = len(classes) if classes else 4
                    in_channels  = int(config.get("in_channels", 3))
                    adapter = _load_smp_state_dict(
                        data=model_path.read_bytes(),
                        architecture=architecture or "unet",
                        encoder=encoder_name,
                        classes=n_classes,
                        device=device,
                        in_channels=in_channels,
                    )
                    adapter.classes = classes
                else:
                    raise ModelLoadError(
                        f"Weights-only loading not supported for architecture '{architecture}' "
                        f"with framework '{framework}'. Upload as full_model instead."
                    )
            else:
                # Try TorchScript first; if it fails and we have SMP metadata, use SMP loader
                try:
                    adapter = _load_full_model_from_path(model_path, device, framework)
                    adapter.classes = classes
                except ModelLoadError as torchscript_err:
                    encoder_name = config.get("encoder")
                    if (
                        framework == "pytorch"
                        and architecture
                        and architecture != "mask_rcnn"
                        and encoder_name
                    ):
                        n_classes   = len(classes) if classes else 4
                        in_channels = int(config.get("in_channels", 3))
                        adapter = _load_smp_state_dict(
                            data=model_path.read_bytes(),
                            architecture=architecture,
                            encoder=encoder_name,
                            classes=n_classes,
                            device=device,
                            in_channels=in_channels,
                        )
                        adapter.classes = classes
                    else:
                        raise torchscript_err
        except ModelLoadError as exc:
            with self._lock:
                self._last_error = str(exc)
            raise

        with self._lock:
            self._adapter = adapter
            self._framework = adapter.framework
            self._preprocess = PreprocessConfig(size=int(config.get("input_size", 512)))
            self._last_error = None
        return True

    def predict(self, image: Image.Image, device: torch.device) -> np.ndarray:
        with self._lock:
            adapter = self._adapter

        if adapter is None:
            raise ModelPredictError("No active model available. Please activate a model before segmenting.")

        return adapter.predict(image, device, self._preprocess)

    def status(self) -> dict:
        with self._lock:
            adapter = self._adapter
            framework = self._framework

        return {
            "loaded": adapter is not None,
            "active": adapter is not None,
            "framework": framework,
            "input_size": self._preprocess.size,
            "last_error": self._last_error,
        }

    def get_class_names(self) -> list[str]:
        """Return class names from the active model, or default classes if none loaded."""
        with self._lock:
            adapter = self._adapter

        if adapter is None:
            return CLASS_NAMES
        return getattr(adapter, "classes", CLASS_NAMES)


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


def compose_overlay(original_image: Image.Image, mask: np.ndarray, alpha: float = 0.5) -> Image.Image:
    """
    Alpha-composite the colorized mask over the original image.
    
    Args:
        original_image: Original PIL Image
        mask: Class mask array with shape (H, W)
        alpha: Transparency level for the mask overlay (0.0-1.0)
    
    Returns:
        Overlay image with same dimensions as original
    """
    # Ensure original image is RGB
    if original_image.mode != "RGB":
        original_image = original_image.convert("RGB")
    
    # Colorize the mask
    colored_mask = colorize_mask(mask)
    
    # Resize colored mask to match original image dimensions if needed
    if colored_mask.size != original_image.size:
        colored_mask = colored_mask.resize(original_image.size, Image.NEAREST)
    
    # Convert to numpy arrays for compositing
    original_arr = np.array(original_image, dtype=np.float32)
    mask_arr = np.array(colored_mask, dtype=np.float32)
    
    # Alpha blend: output = original * (1 - alpha) + mask * alpha
    overlay_arr = original_arr * (1.0 - alpha) + mask_arr * alpha
    overlay_arr = np.clip(overlay_arr, 0, 255).astype(np.uint8)
    
    return Image.fromarray(overlay_arr, mode="RGB")