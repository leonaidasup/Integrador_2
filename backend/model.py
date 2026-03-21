from __future__ import annotations

from pathlib import Path
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


def _to_tensor(image: Image.Image, size: int = 256) -> torch.Tensor:
    """Convert PIL image to normalized tensor with shape [1, 3, H, W]."""
    image_rgb = image.convert("RGB").resize((size, size), Image.BILINEAR)
    arr = np.array(image_rgb, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    tensor = torch.from_numpy(arr).unsqueeze(0)
    return tensor


def _fallback_predict(image: Image.Image) -> np.ndarray:
    """
    Fallback segmentation when no compatible model is available.
    Splits grayscale intensities into 3 classes.
    """
    gray = np.array(image.convert("L"), dtype=np.float32)
    q1, q2 = np.quantile(gray, [0.33, 0.66])

    mask = np.zeros_like(gray, dtype=np.uint8)
    mask[(gray > q1) & (gray <= q2)] = 1
    mask[gray > q2] = 2
    return mask


def load_model(model_path: Path, device: torch.device) -> Optional[nn.Module]:
    """
    Load a trained PyTorch segmentation model.
    """
    if not model_path.exists():
        return None

    try:
        checkpoint = torch.load(model_path, map_location=device)

        # Case 1: full model object was saved
        if isinstance(checkpoint, nn.Module):
            model = checkpoint.to(device)
            model.eval()
            return model

        # Case 2: state_dict or custom checkpoint dictionary
        if isinstance(checkpoint, dict):
            if "model_state_dict" in checkpoint or any(
                isinstance(v, torch.Tensor) for v in checkpoint.values()
            ):
                # Placeholder architecture; replace with your own network.
                model = DummySegModel(num_classes=3).to(device)
                state_dict = checkpoint.get("model_state_dict", checkpoint)
                model.load_state_dict(state_dict, strict=False)
                model.eval()
                return model

    except Exception:
        return None

    return None


class DummySegModel(nn.Module):
    """
    Placeholder model architecture.

    TODO: Replace with the actual architecture
    """

    def __init__(self, num_classes: int = 3) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
        )
        self.head = nn.Conv2d(32, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feats = self.encoder(x)
        logits = self.head(feats)
        return logits


def predict(image: Image.Image, model: Optional[nn.Module], device: torch.device) -> np.ndarray:
    """
    Run segmentation and return a class mask with values {0,1,2}.
    """
    original_w, original_h = image.size

    if model is None:
        return _fallback_predict(image)

    x = _to_tensor(image).to(device)

    with torch.no_grad():
        out = model(x)

        # Handle common output formats.
        if isinstance(out, dict) and "out" in out:
            out = out["out"]

        if out.ndim != 4:
            return _fallback_predict(image)

        if out.shape[1] == 1:
            # Binary-like output mapped to 3 bands.
            prob = torch.sigmoid(out)[0, 0].cpu().numpy()
            mask_small = np.digitize(prob, bins=[0.33, 0.66]).astype(np.uint8)
        else:
            mask_small = torch.argmax(out, dim=1)[0].cpu().numpy().astype(np.uint8)

    mask_img = Image.fromarray(mask_small, mode="L").resize(
        (original_w, original_h), Image.NEAREST
    )
    return np.array(mask_img, dtype=np.uint8)


def colorize_mask(mask: np.ndarray) -> Image.Image:
    """Convert class mask to RGB visualization."""
    h, w = mask.shape
    color = np.zeros((h, w, 3), dtype=np.uint8)
    for class_id, rgb in CLASS_COLORS.items():
        color[mask == class_id] = rgb
    return Image.fromarray(color, mode="RGB")
