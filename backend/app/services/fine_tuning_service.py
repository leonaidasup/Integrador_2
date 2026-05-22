"""
Fine-tuning service for model training on COCO datasets.

Handles:
- Loading base model from registry
- Parsing COCO annotations
- Preparing data loaders
- Running fine-tuning loop
- Computing metrics (DICE, F1, IoU, Precision, Recall)
- Saving checkpoints and results
"""

from __future__ import annotations

import io
import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image as PILImage
from torch.utils.data import DataLoader, Dataset

from app.core.supabase_client import get_supabase_client
from app.services import storage
from app.services.model_manager import ModelLoadError

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────
# Data Loading
# ────────────────────────────────────────────────────────────────────────────


class COCODataset(Dataset):
    """PyTorch Dataset for COCO format images and segmentation masks."""

    def __init__(
        self,
        image_paths: List[str],
        annotations: Dict[str, Any],
        split: str = "train",
        transform=None,
    ):
        """
        Args:
            image_paths: List of image file paths
            annotations: COCO annotations dict with 'images', 'annotations', 'categories'
            split: "train" or "val"
            transform: Optional image transforms
        """
        self.image_paths = image_paths
        self.annotations = annotations
        self.split = split
        self.transform = transform

        # Build image_id -> annotations mapping
        self.img_to_annots = {}
        for ann in annotations.get("annotations", []):
            img_id = ann["image_id"]
            if img_id not in self.img_to_annots:
                self.img_to_annots[img_id] = []
            self.img_to_annots[img_id].append(ann)

        # Category id mapping
        self.cat_id_to_idx = {
            cat["id"]: idx
            for idx, cat in enumerate(annotations.get("categories", []))
        }
        self.num_classes = len(self.cat_id_to_idx)

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, idx: int) -> tuple:
        image_path = self.image_paths[idx]

        # Load image
        try:
            image = PILImage.open(image_path).convert("RGB")
        except Exception as e:
            logger.warning(f"Failed to load image {image_path}: {e}")
            # Return dummy data
            image = PILImage.new("RGB", (224, 224))

        # Create mask
        mask = self._create_mask(image.size, idx)

        # Convert to tensors
        image = torch.tensor(np.array(image), dtype=torch.float32).permute(2, 0, 1) / 255.0
        mask = torch.tensor(mask, dtype=torch.long)

        if self.transform:
            image = self.transform(image)

        return image, mask

    def _create_mask(self, image_size: tuple, idx: int) -> np.ndarray:
        """Create segmentation mask from COCO annotations."""
        w, h = image_size
        mask = np.zeros((h, w), dtype=np.int32)

        # Get annotations for this image (dummy for now)
        # TODO: Implement proper polygon to mask conversion using pycocotools
        return mask


# ────────────────────────────────────────────────────────────────────────────
# Metrics Computation
# ────────────────────────────────────────────────────────────────────────────


def compute_dice(pred: torch.Tensor, target: torch.Tensor, num_classes: int = 2) -> float:
    """Compute DICE coefficient."""
    smooth = 1e-6
    dice_scores = []

    for c in range(num_classes):
        pred_c = (pred == c).float()
        target_c = (target == c).float()

        intersection = (pred_c * target_c).sum().float()
        union = pred_c.sum().float() + target_c.sum().float()

        dice = (2.0 * intersection + smooth) / (union + smooth)
        dice_scores.append(dice.item())

    return np.mean(dice_scores)


def compute_iou(pred: torch.Tensor, target: torch.Tensor, num_classes: int = 2) -> float:
    """Compute IoU (Intersection over Union)."""
    smooth = 1e-6
    iou_scores = []

    for c in range(num_classes):
        pred_c = (pred == c).float()
        target_c = (target == c).float()

        intersection = (pred_c * target_c).sum().float()
        union = (pred_c + target_c - pred_c * target_c).sum().float()

        iou = (intersection + smooth) / (union + smooth)
        iou_scores.append(iou.item())

    return np.mean(iou_scores)


def compute_precision(pred: torch.Tensor, target: torch.Tensor, num_classes: int = 2) -> float:
    """Compute Precision."""
    precision_scores = []

    for c in range(num_classes):
        pred_c = (pred == c).float()
        target_c = (target == c).float()

        tp = (pred_c * target_c).sum().float()
        fp = (pred_c * (1 - target_c)).sum().float()

        precision = tp / (tp + fp + 1e-6)
        precision_scores.append(precision.item())

    return np.mean(precision_scores)


def compute_recall(pred: torch.Tensor, target: torch.Tensor, num_classes: int = 2) -> float:
    """Compute Recall."""
    recall_scores = []

    for c in range(num_classes):
        pred_c = (pred == c).float()
        target_c = (target == c).float()

        tp = (pred_c * target_c).sum().float()
        fn = ((1 - pred_c) * target_c).sum().float()

        recall = tp / (tp + fn + 1e-6)
        recall_scores.append(recall.item())

    return np.mean(recall_scores)


def compute_f1(pred: torch.Tensor, target: torch.Tensor, num_classes: int = 2) -> float:
    """Compute F1 Score."""
    precision = compute_precision(pred, target, num_classes)
    recall = compute_recall(pred, target, num_classes)

    f1 = 2 * (precision * recall) / (precision + recall + 1e-6)
    return f1


# ────────────────────────────────────────────────────────────────────────────
# Loss Functions
# ────────────────────────────────────────────────────────────────────────────


def get_loss_function(loss_name: str) -> nn.Module:
    """Get loss function by name."""
    loss_name = loss_name.lower()

    if loss_name == "crossentropy":
        return nn.CrossEntropyLoss()
    elif loss_name == "bce":
        return nn.BCEWithLogitsLoss()
    elif loss_name == "mse":
        return nn.MSELoss()
    elif loss_name == "focal":
        # Simplified Focal Loss
        return nn.CrossEntropyLoss()  # TODO: Implement proper Focal Loss
    else:
        logger.warning(f"Unknown loss function {loss_name}, using CrossEntropy")
        return nn.CrossEntropyLoss()


# ────────────────────────────────────────────────────────────────────────────
# Fine-tuning Service
# ────────────────────────────────────────────────────────────────────────────


class FineTuningService:
    """Service to handle model fine-tuning on COCO datasets."""

    def __init__(self, experiment_id: str, user_id: str, db=None):
        self.experiment_id = experiment_id
        self.user_id = user_id
        self.db = db or get_supabase_client()

        # Load experiment config
        exp_res = (
            self.db.table("experiments")
            .select("*")
            .eq("id", experiment_id)
            .limit(1)
            .execute()
        )
        if not exp_res.data:
            raise ValueError(f"Experiment {experiment_id} not found")

        self.experiment = exp_res.data[0]
        self.model_id = self.experiment["model_id"]
        self.dataset_id = self.experiment["dataset_id"]
        self.config = self.experiment.get("config", {})

        # Extract config
        self.learning_rate = float(self.config.get("learning_rate", 0.001))
        self.epochs = int(self.config.get("epochs", 10))
        self.batch_size = int(self.config.get("batch_size", 32))
        self.loss_fn_name = self.config.get("loss_fn", "crossentropy")
        self.optimizer_name = self.config.get("optimizer", "adam").lower()
        self.early_stopping = self.config.get("early_stopping", True)
        self.patience = int(self.config.get("patience", 5))

        # Device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")

        # State
        self.model = None
        self.train_loader = None
        self.val_loader = None
        self.optimizer = None
        self.loss_fn = None
        self.epoch_history = []
        self.best_loss = float("inf")
        self.patience_counter = 0

    def load_dataset(self) -> None:
        """Load images from dataset and prepare data loaders."""
        logger.info(f"Loading dataset {self.dataset_id}")

        # Get all images for this dataset
        img_res = (
            self.db.table("images")
            .select("*")
            .eq("dataset_id", self.dataset_id)
            .execute()
        )

        if not img_res.data:
            raise ValueError(f"No images found in dataset {self.dataset_id}")

        images = img_res.data
        logger.info(f"Found {len(images)} images")

        # Download images locally
        image_paths = []
        for img_record in images:
            try:
                img_data = storage.download_image(img_record["storage_path"])
                # Save to temp file
                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
                    f.write(img_data)
                    image_paths.append(f.name)
            except Exception as e:
                logger.warning(f"Failed to download image {img_record['id']}: {e}")

        logger.info(f"Downloaded {len(image_paths)} images")

        # TODO: Load COCO annotations from database or extract from ZIP
        # For now, use empty annotations
        annotations = {"images": [], "annotations": [], "categories": [{"id": 1, "name": "object"}]}

        # Create dataset
        dataset = COCODataset(image_paths, annotations)

        # Split into train/val
        train_size = int(0.8 * len(dataset))
        val_size = len(dataset) - train_size

        from torch.utils.data import random_split

        train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

        # Create data loaders
        self.train_loader = DataLoader(
            train_dataset, batch_size=self.batch_size, shuffle=True, num_workers=0
        )
        self.val_loader = DataLoader(
            val_dataset, batch_size=self.batch_size, shuffle=False, num_workers=0
        )

        logger.info(
            f"Created loaders: train={len(self.train_loader)} batches, val={len(self.val_loader)} batches"
        )

    def load_model(self) -> None:
        """Load base model from registry."""
        logger.info(f"Loading model {self.model_id} from registry")

        from app.services.model_manager import MODEL_MANAGER

        # Try to load from model manager
        try:
            model = MODEL_MANAGER.get_model(self.model_id)
            if model is not None:
                self.model = model.to(self.device)
                logger.info(f"Loaded model {self.model_id} from MODEL_MANAGER")
                return
        except Exception as e:
            logger.warning(f"Failed to load model from MODEL_MANAGER: {e}")

        # Fallback: Load from registry manually
        model_res = (
            self.db.table("models")
            .select("*")
            .eq("id", self.model_id)
            .limit(1)
            .execute()
        )

        if not model_res.data:
            raise ModelLoadError(f"Model {self.model_id} not found in registry")

        model_record = model_res.data[0]
        logger.info(f"Model record: {model_record['architecture']}, framework: {model_record.get('framework', 'keras')}")

        # Load based on framework
        framework = model_record.get("framework", "keras").lower()

        if framework == "pytorch":
            # Load PyTorch model
            try:
                import segmentation_models_pytorch as smp

                encoder = model_record.get("encoder", "efficientnet-b5")
                num_classes = model_record.get("num_classes", 2)

                self.model = smp.Unet(
                    encoder_name=encoder,
                    encoder_weights=None,  # Load pretrained weights below
                    in_channels=3,
                    classes=num_classes,
                ).to(self.device)

                logger.info(f"Created U-Net model with encoder {encoder}")
            except Exception as e:
                logger.error(f"Failed to create PyTorch model: {e}")
                raise
        else:
            # Load TensorFlow/Keras model
            try:
                import tensorflow as tf

                model_path = model_record.get("artifact_path")
                if not model_path:
                    raise ModelLoadError("No artifact_path for Keras model")

                # TODO: Download from storage if needed
                self.model = tf.keras.models.load_model(model_path)
                logger.info(f"Loaded Keras model from {model_path}")
            except Exception as e:
                logger.error(f"Failed to load Keras model: {e}")
                # Create dummy model for now
                logger.warning("Using dummy model as fallback")
                self.model = nn.Sequential(
                    nn.Conv2d(3, 64, 3, padding=1),
                    nn.ReLU(),
                    nn.Conv2d(64, 1, 3, padding=1),
                ).to(self.device)

    def setup_training(self) -> None:
        """Set up loss function and optimizer."""
        self.loss_fn = get_loss_function(self.loss_fn_name).to(self.device)

        if self.optimizer_name == "adam":
            self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        elif self.optimizer_name == "adamw":
            self.optimizer = optim.AdamW(self.model.parameters(), lr=self.learning_rate)
        elif self.optimizer_name == "sgd":
            self.optimizer = optim.SGD(self.model.parameters(), lr=self.learning_rate, momentum=0.9)
        else:
            logger.warning(f"Unknown optimizer {self.optimizer_name}, using Adam")
            self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)

        logger.info(f"Setup: loss_fn={self.loss_fn_name}, optimizer={self.optimizer_name}")

    def train_one_epoch(self) -> Dict[str, float]:
        """Train for one epoch and return metrics."""
        self.model.train()
        total_loss = 0.0
        all_preds = []
        all_targets = []

        for batch_idx, (images, targets) in enumerate(self.train_loader):
            images = images.to(self.device)
            targets = targets.to(self.device)

            # Forward pass
            self.optimizer.zero_grad()
            outputs = self.model(images)

            # Loss
            loss = self.loss_fn(outputs, targets)

            # Backward pass
            loss.backward()
            self.optimizer.step()

            total_loss += loss.item()

            # Store for metrics
            preds = outputs.argmax(dim=1)
            all_preds.append(preds.detach().cpu())
            all_targets.append(targets.detach().cpu())

        # Compute metrics
        all_preds = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)

        avg_loss = total_loss / max(len(self.train_loader), 1)
        dice = compute_dice(all_preds, all_targets)
        f1 = compute_f1(all_preds, all_targets)
        iou = compute_iou(all_preds, all_targets)
        precision = compute_precision(all_preds, all_targets)
        recall = compute_recall(all_preds, all_targets)

        return {
            "loss": avg_loss,
            "dice": dice,
            "f1": f1,
            "iou": iou,
            "precision": precision,
            "recall": recall,
        }

    def validate_one_epoch(self) -> Dict[str, float]:
        """Validate for one epoch and return metrics."""
        self.model.eval()
        total_loss = 0.0
        all_preds = []
        all_targets = []

        with torch.no_grad():
            for images, targets in self.val_loader:
                images = images.to(self.device)
                targets = targets.to(self.device)

                # Forward pass
                outputs = self.model(images)

                # Loss
                loss = self.loss_fn(outputs, targets)
                total_loss += loss.item()

                # Store for metrics
                preds = outputs.argmax(dim=1)
                all_preds.append(preds.detach().cpu())
                all_targets.append(targets.detach().cpu())

        # Compute metrics
        all_preds = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)

        avg_loss = total_loss / max(len(self.val_loader), 1)
        dice = compute_dice(all_preds, all_targets)
        f1 = compute_f1(all_preds, all_targets)
        iou = compute_iou(all_preds, all_targets)
        precision = compute_precision(all_preds, all_targets)
        recall = compute_recall(all_preds, all_targets)

        return {
            "val_loss": avg_loss,
            "val_dice": dice,
            "val_f1": f1,
            "val_iou": iou,
            "val_precision": precision,
            "val_recall": recall,
        }

    def train(self) -> Dict[str, Any]:
        """Run full fine-tuning training loop."""
        logger.info(f"Starting fine-tuning for experiment {self.experiment_id}")

        try:
            # Setup
            self.load_model()
            self.load_dataset()
            self.setup_training()

            # Training loop
            for epoch in range(1, self.epochs + 1):
                logger.info(f"Epoch {epoch}/{self.epochs}")

                # Train
                train_metrics = self.train_one_epoch()

                # Validate
                val_metrics = self.validate_one_epoch()

                # Combine metrics
                epoch_metrics = {**train_metrics, **val_metrics}
                epoch_metrics["epoch"] = epoch
                epoch_metrics["timestamp"] = datetime.utcnow().isoformat()

                self.epoch_history.append(epoch_metrics)

                # Log
                logger.info(
                    f"  Loss: {train_metrics['loss']:.4f} | Val Loss: {val_metrics['val_loss']:.4f} | "
                    f"IoU: {train_metrics['iou']:.4f} | Val IoU: {val_metrics['val_iou']:.4f}"
                )

                # Early stopping
                if self.early_stopping:
                    if val_metrics["val_loss"] < self.best_loss:
                        self.best_loss = val_metrics["val_loss"]
                        self.patience_counter = 0
                        # Save checkpoint
                        self._save_checkpoint(epoch)
                    else:
                        self.patience_counter += 1
                        if self.patience_counter >= self.patience:
                            logger.info(f"Early stopping at epoch {epoch}")
                            break

            logger.info("Training completed successfully")

            return {
                "status": "completed",
                "epochs_trained": len(self.epoch_history),
                "epoch_history": self.epoch_history,
                "best_val_loss": self.best_loss,
            }

        except Exception as e:
            logger.error(f"Training failed: {e}", exc_info=True)
            return {
                "status": "failed",
                "error": str(e),
            }

    def _save_checkpoint(self, epoch: int) -> None:
        """Save model checkpoint."""
        checkpoint_path = f"/tmp/checkpoint_exp{self.experiment_id}_epoch{epoch}.pt"
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": self.model.state_dict(),
                "optimizer_state_dict": self.optimizer.state_dict(),
                "loss": self.best_loss,
            },
            checkpoint_path,
        )
        logger.info(f"Saved checkpoint to {checkpoint_path}")

    def save_trained_model(self) -> str:
        """Save final trained model to storage."""
        model_path = f"/tmp/trained_model_exp{self.experiment_id}.pt"
        torch.save(self.model.state_dict(), model_path)
        logger.info(f"Saved trained model to {model_path}")
        return model_path
