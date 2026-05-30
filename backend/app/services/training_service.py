from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Dict, List, Optional

import numpy as np
import torch
from PIL import Image

from app.services.model_manager import MODEL_MANAGER, ModelLoadError, ModelPredictError


class TrainingStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Epoch progress (SSE payload) ──────────────────────────────────────────────

@dataclass
class EpochProgress:
    experiment_id: str
    epoch: int
    total_epochs: int
    status: TrainingStatus
    error: Optional[str] = None
    # Metrics for the current epoch
    loss: Optional[float] = None
    val_loss: Optional[float] = None
    accuracy: Optional[float] = None
    val_accuracy: Optional[float] = None
    iou: Optional[float] = None
    val_iou: Optional[float] = None
    duration_seconds: Optional[float] = None

    def as_dict(self) -> dict:
        return {
            "experiment_id": self.experiment_id,
            "epoch": self.epoch,
            "total_epochs": self.total_epochs,
            "progress": round(self.epoch / self.total_epochs * 100) if self.total_epochs else 0,
            "status": self.status.value,
            "error": self.error,
            "metrics": {
                "loss": self.loss,
                "val_loss": self.val_loss,
                "accuracy": self.accuracy,
                "val_accuracy": self.val_accuracy,
                "iou": self.iou,
                "val_iou": self.val_iou,
                "duration_seconds": self.duration_seconds,
            },
        }


# ── In-memory experiment state ────────────────────────────────────────────────

@dataclass
class ExperimentState:
    id: str
    name: str
    dataset_id: str
    model_id: str
    epochs: int
    user_id: str
    architecture: Optional[str] = None
    encoder: Optional[str] = None
    hyperparameters: Optional[dict] = None

    status: TrainingStatus = TrainingStatus.QUEUED
    current_epoch: int = 0
    error: Optional[str] = None

    # Metrics history (per epoch)
    epoch_history: list = field(default_factory=list)

    # Aggregate bests
    best_loss: Optional[float] = None
    best_iou: Optional[float] = None
    best_accuracy: Optional[float] = None

    # Timing
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    # SSE subscribers
    subscribers: List[Callable[[EpochProgress], None]] = field(default_factory=list)
    _pause_event: threading.Event = field(default_factory=threading.Event)
    _cancel_flag: bool = False
    
    # Confusion matrix & distributions (set during training)
    _confusion_matrix: Optional[list] = field(default=None)
    _dataset_distribution: Optional[list] = field(default=None)

    def __post_init__(self):
        self._pause_event.set()

    def subscribe(self, callback):
        self.subscribers.append(callback)

    def unsubscribe(self, callback):
        self.subscribers = [s for s in self.subscribers if s is not callback]

    def notify(self, epoch_progress: Optional[EpochProgress] = None):
        if epoch_progress is None:
            epoch_progress = EpochProgress(
                experiment_id=self.id,
                epoch=self.current_epoch,
                total_epochs=self.epochs,
                status=self.status,
                error=self.error,
            )
        for cb in list(self.subscribers):
            try:
                cb(epoch_progress)
            except Exception:
                pass

    def pause(self):
        self._pause_event.clear()
        self.status = TrainingStatus.PAUSED
        self.notify()

    def resume(self):
        self._pause_event.set()
        self.status = TrainingStatus.RUNNING
        self.notify()

    def cancel(self):
        self._cancel_flag = True
        self._pause_event.set()


# ── Persistence helpers ───────────────────────────────────────────────────────
def run_existing_experiment(
    self,
    experiment_id: str,
    name: str,
    dataset_id: str,
    model_id: str,
    epochs: int,
    images: List[Image.Image],
    user_id: str,
    architecture: Optional[str] = None,
    encoder: Optional[str] = None,
    hyperparameters: Optional[dict] = None,
) -> ExperimentState:
    # Reutiliza el ID existente en vez de generar uno nuevo
    state = ExperimentState(
        id=experiment_id,
        name=name,
        dataset_id=dataset_id,
        model_id=model_id,
        epochs=max(1, epochs),
        user_id=user_id,
        architecture=architecture,
        encoder=encoder,
        hyperparameters=hyperparameters,
    )
    with self._lock:
        self._experiments[experiment_id] = state

    _persist_experiment(state)

    thread = threading.Thread(
        target=self._run_training,
        args=(state, images),
        daemon=True,
    )
    thread.start()
    return state
    
def _persist_experiment(state: ExperimentState):
    """Upsert the full experiment record to Supabase, including a summarized 'results' payload for UI."""
    try:
        from app.core.supabase_client import get_supabase_client
        db = get_supabase_client()

        total_duration = None
        if state.started_at and state.finished_at:
            start = datetime.fromisoformat(state.started_at)
            end = datetime.fromisoformat(state.finished_at)
            total_duration = (end - start).total_seconds()

        epoch_history_data = [
            e if isinstance(e, dict) else vars(e)
            for e in state.epoch_history
        ]

        # Resolver nombres legibles desde Supabase
        try:
            dataset_res = db.table("datasets").select("name").eq("id", state.dataset_id).limit(1).execute()
            dataset_name = (dataset_res.data or [{}])[0].get("name") or state.dataset_id
        except Exception:
            dataset_name = state.dataset_id

        try:
            model_res = db.table("models").select("name").eq("id", state.model_id).limit(1).execute()
            model_name = (model_res.data or [{}])[0].get("name") or state.model_id
        except Exception:
            model_name = state.model_id

        results_payload = None
        if epoch_history_data:
            last = epoch_history_data[-1]
            final_iou = last.get("val_iou") or last.get("iou") or state.best_iou
            final_loss = last.get("val_loss") or last.get("loss")
            final_precision = last.get("precision")
            final_recall = last.get("recall")
            final_f1 = last.get("f1")
            try:
                dice = (2 * float(final_iou) / (1.0 + float(final_iou))) if final_iou is not None else None
            except Exception:
                dice = None

            training_run = {
                "id": state.id,
                "date": state.finished_at or state.started_at or datetime.utcnow().isoformat(),
                "name": state.name,
                "dataset": dataset_name,
                "model": model_name,
                "batch": int(last.get("batch_size") or (state.hyperparameters or {}).get("batch_size") or 0),
                "loss_function": str((state.hyperparameters or {}).get("loss") or "crossentropy"),
                "iou": round(float(final_iou), 4) if final_iou is not None else None,
                "dice": round(float(dice), 4) if dice is not None else None,
                "recall": round(float(final_recall), 4) if final_recall is not None else None,
                "precision": round(float(final_precision), 4) if final_precision is not None else None,
                "f1": round(float(final_f1), 4) if final_f1 is not None else None,
                "loss": round(float(final_loss), 4) if final_loss is not None else None,
                "duration": f"{int(total_duration)}s" if total_duration is not None else None,
                "status": state.status.value,
                "epochs": epoch_history_data,
                "confusion": getattr(state, '_confusion_matrix', None),
                "confusion_class_names": getattr(state, '_confusion_class_names', None),
                "dataset_class_distribution": getattr(state, '_dataset_distribution', None),
                "label_dist": getattr(state, '_dataset_distribution', None),
            }

            # Leer trainings previos y acumular
            try:
                existing_res = db.table("experiments").select("results").eq("id", state.id).limit(1).execute()
                existing_results = (existing_res.data or [{}])[0].get("results") or {}
                previous_trainings = existing_results.get("trainings") or []
            except Exception:
                previous_trainings = []

            # Reemplazar si ya existe un run con el mismo id, si no agregar
            updated_trainings = [t for t in previous_trainings if t.get("id") != training_run["id"]]
            updated_trainings.append(training_run)

            results_payload = {"trainings": updated_trainings}

        record = {
            "id": state.id,
            "user_id": state.user_id,
            "name": state.name,
            "dataset_id": state.dataset_id,
            "model_id": state.model_id,
            "architecture": state.architecture,
            "encoder": state.encoder,
            "epochs_planned": state.epochs,
            "epochs_completed": state.current_epoch,
            "status": state.status.value,
            "error": state.error,
            "hyperparameters": state.hyperparameters or {},
            "best_loss": state.best_loss,
            "best_iou": state.best_iou,
            "best_accuracy": state.best_accuracy,
            "final_loss": epoch_history_data[-1].get("loss") if epoch_history_data else None,
            "final_iou": epoch_history_data[-1].get("iou") if epoch_history_data else None,
            "final_accuracy": epoch_history_data[-1].get("accuracy") if epoch_history_data else None,
            "started_at": state.started_at,
            "finished_at": state.finished_at,
            "total_duration_seconds": total_duration,
            "epoch_history": epoch_history_data,
            "results": results_payload,
        }

        db.table("experiments").upsert(record).execute()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to persist experiment %s: %s", state.id, exc)



# ── Training service ──────────────────────────────────────────────────────────

class TrainingService:
    def __init__(self, max_workers: int = 2):
        self._experiments: Dict[str, ExperimentState] = {}
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(max_workers)

    def create_experiment(
        self,
        name: str,
        dataset_id: str,
        model_id: str,
        epochs: int,
        images: List[Image.Image],
        user_id: str,
        architecture: Optional[str] = None,
        encoder: Optional[str] = None,
        hyperparameters: Optional[dict] = None,
    ) -> ExperimentState:
        exp_id = str(uuid.uuid4())
        state = ExperimentState(
            id=exp_id,
            name=name,
            dataset_id=dataset_id,
            model_id=model_id,
            epochs=max(1, epochs),
            user_id=user_id,
            architecture=architecture,
            encoder=encoder,
            hyperparameters=hyperparameters,
        )
        with self._lock:
            self._experiments[exp_id] = state

        # Persist initial record immediately
        _persist_experiment(state)

        thread = threading.Thread(
            target=self._run_training,
            args=(state, images),
            daemon=True,
        )
        thread.start()
        return state

    def get(self, experiment_id: str) -> Optional[ExperimentState]:
        return self._experiments.get(experiment_id)

    def run_existing_experiment(
        self,
        experiment_id: str,
        name: str,
        dataset_id: str,
        model_id: str,
        epochs: int,
        images: List[Image.Image],
        user_id: str,
        architecture: Optional[str] = None,
        encoder: Optional[str] = None,
        hyperparameters: Optional[dict] = None,
    ) -> ExperimentState:
        # Reutiliza el ID existente en vez de generar uno nuevo
        state = ExperimentState(
            id=experiment_id,
            name=name,
            dataset_id=dataset_id,
            model_id=model_id,
            epochs=max(1, epochs),
            user_id=user_id,
            architecture=architecture,
            encoder=encoder,
            hyperparameters=hyperparameters,
        )
        with self._lock:
            self._experiments[experiment_id] = state

        _persist_experiment(state)

        thread = threading.Thread(
            target=self._run_training,
            args=(state, images),
            daemon=True,
        )
        thread.start()
        return state

    def list_all(self) -> List[ExperimentState]:
        return list(self._experiments.values())

    def pause(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status == TrainingStatus.RUNNING:
            state.pause()
            _persist_experiment(state)
            return True
        return False

    def resume(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status == TrainingStatus.PAUSED:
            state.resume()
            _persist_experiment(state)
            return True
        return False

    def cancel(self, experiment_id: str) -> bool:
        state = self._experiments.get(experiment_id)
        if state and state.status in (TrainingStatus.RUNNING, TrainingStatus.PAUSED, TrainingStatus.QUEUED):
            state.cancel()
            state.status = TrainingStatus.CANCELLED
            state.finished_at = _now_iso()
            state.notify()
            _persist_experiment(state)
            return True
        return False

    def _run_training(self, state: ExperimentState, images: List[Image.Image]):
        print('a')
        with self._semaphore:
            if state._cancel_flag:
                print(f"[TRAINING] Cancelado antes de iniciar {state.id}")
                return

            state.status = TrainingStatus.RUNNING
            state.epochs = 1
            state.started_at = _now_iso()
            state.notify()
            _persist_experiment(state)

            try:
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

                try:
                    from app.core.supabase_client import get_supabase_client
                    from app.services import storage
                    db = get_supabase_client()

                    res = db.table("images").select("id,storage_path").eq("dataset_id", state.dataset_id).execute()
                    image_records = res.data or []

                    pairs: list[tuple[Image.Image, np.ndarray]] = []
                    import io as _io
                    for rec in image_records:
                        try:
                            seg_res = db.table("segmentations").select("mask_path").eq("image_id", rec["id"]).limit(1).execute()
                            if not seg_res.data:
                                continue
                            img_bytes = storage.download_image(rec["storage_path"])
                            mask_np = storage.download_mask(seg_res.data[0]["mask_path"])
                            pil_img = Image.open(_io.BytesIO(img_bytes)).convert("RGB")
                            pairs.append((pil_img, mask_np))
                        except Exception as e:
                            print(f"[TRAINING] Error cargando imagen {rec['id']}: {e}")
                            continue
                    print(f"[TRAINING] Pares imagen+máscara cargados: {len(pairs)}")
                except Exception as exc:
                    raise RuntimeError(f"Failed to load annotated dataset: {exc}") from exc

                if not pairs:
                    raise RuntimeError("No annotated images found for dataset; at least one segmentation is required to train.")

                try:
                    import segmentation_models_pytorch as smp
                except Exception as exc:
                    raise RuntimeError("segmentation-models-pytorch is required for training.") from exc

                preprocess_size = MODEL_MANAGER._preprocess.size if hasattr(MODEL_MANAGER, "_preprocess") else 224

                class SimpleSegmentationDataset(torch.utils.data.Dataset):
                    def __init__(self, pairs, size: int):
                        self.pairs = pairs
                        self.size = size

                    def __len__(self):
                        return len(self.pairs)

                    def __getitem__(self, idx):
                        pil_img, mask_np = self.pairs[idx]
                        img_resized = pil_img.resize((self.size, self.size), Image.BICUBIC)
                        arr = np.array(img_resized, dtype=np.float32) / 255.0
                        arr = np.transpose(arr, (2, 0, 1))
                        img_tensor = torch.from_numpy(arr).float()
                        mask_img = Image.fromarray(mask_np.astype(np.uint8), mode="L").resize((self.size, self.size), Image.NEAREST)
                        mask_arr = np.array(mask_img, dtype=np.int64)
                        mask_tensor = torch.from_numpy(mask_arr).long()
                        return img_tensor, mask_tensor

                total = len(pairs)
                val_count = max(1, int(0.2 * total))
                train_pairs = pairs[val_count:]
                val_pairs = pairs[:val_count]

                train_ds = SimpleSegmentationDataset(train_pairs, preprocess_size)
                val_ds = SimpleSegmentationDataset(val_pairs, preprocess_size)

                batch_size = int(state.hyperparameters.get("batch_size", 4) if state.hyperparameters else 4)
                train_loader = torch.utils.data.DataLoader(train_ds, batch_size=batch_size, shuffle=True)
                val_loader = torch.utils.data.DataLoader(val_ds, batch_size=batch_size, shuffle=False)

                architecture = state.architecture or (state.hyperparameters or {}).get("architecture") or "unet"
                encoder = state.encoder or (state.hyperparameters or {}).get("encoder") or "resnet34"

                all_class_names = MODEL_MANAGER.get_class_names()
                n_classes = len(all_class_names)
                class_names = all_class_names
                # Clases para visualización: excluir background
                display_class_names = [n for n in all_class_names if n.lower() != "background"]

                arch_key = architecture.lower().replace("-", "").replace("_", "")
                smp_class = getattr(smp, arch_key.capitalize(), None)
                if smp_class is None:
                    model = smp.Unet(encoder_name=encoder, encoder_weights="imagenet", in_channels=3, classes=n_classes)
                else:
                    model = smp_class(encoder_name=encoder, encoder_weights="imagenet", in_channels=3, classes=n_classes)

                model.to(device)

                lr = float((state.hyperparameters or {}).get("lr", 1e-3))
                optimizer = torch.optim.Adam(model.parameters(), lr=lr)
                loss_fn = torch.nn.CrossEntropyLoss()

                def compute_iou_batch(pred, target, n_classes):
                    ious = []
                    pred = pred.detach().cpu().numpy()
                    target = target.detach().cpu().numpy()
                    for cls in range(1, n_classes):
                        pred_c = (pred == cls).astype(int)
                        tgt_c = (target == cls).astype(int)
                        inter = (pred_c & tgt_c).sum()
                        union = (pred_c | tgt_c).sum()
                        ious.append(1.0 if union == 0 else inter / union)
                    return float(np.mean(ious)) if ious else 0.0

                def compute_metrics_batch(pred, target, n_classes):
                    pred_np = pred.detach().cpu().numpy().flatten().astype(np.int32)
                    target_np = target.detach().cpu().numpy().flatten().astype(np.int32)
                    confusion = np.zeros((n_classes, n_classes), dtype=np.float64)
                    for true_label, pred_label in zip(target_np, pred_np):
                        if 0 <= true_label < n_classes and 0 <= pred_label < n_classes:
                            confusion[int(true_label), int(pred_label)] += 1
                    precisions, recalls, f1s = [], [], []
                    for cls in range(n_classes):
                        tp = confusion[cls, cls]
                        fp = confusion[:, cls].sum() - tp
                        fn = confusion[cls, :].sum() - tp
                        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
                        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
                        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
                        precisions.append(float(precision))
                        recalls.append(float(recall))
                        f1s.append(float(f1))
                    return confusion, float(np.mean(precisions)), float(np.mean(recalls)), float(np.mean(f1s))

                all_confusion_matrices = []
                for epoch in range(1, state.epochs + 1):
                    print(f"[TRAINING] Época {epoch}/{state.epochs} iniciando...")
                    if state._cancel_flag:
                        state.status = TrainingStatus.CANCELLED
                        state.finished_at = _now_iso()
                        state.notify()
                        _persist_experiment(state)
                        return

                    state._pause_event.wait()
                    epoch_start = time.time()
                    model.train()
                    train_loss, train_steps = 0.0, 0

                    for xb, yb in train_loader:
                        xb, yb = xb.to(device), yb.to(device)
                        optimizer.zero_grad()
                        out = model(xb)
                        if isinstance(out, dict) and "out" in out:
                            out = out["out"]
                        loss = loss_fn(out, yb)
                        loss.backward()
                        optimizer.step()
                        train_loss += loss.item()
                        train_steps += 1

                    avg_train_loss = train_loss / max(1, train_steps)

                    model.eval()
                    val_loss, val_steps, val_iou = 0.0, 0, 0.0
                    epoch_precisions, epoch_recalls, epoch_f1s = [], [], []
                    epoch_confusion_abs = np.zeros((n_classes, n_classes), dtype=np.float64)

                    with torch.no_grad():
                        for xb, yb in val_loader:
                            xb, yb = xb.to(device), yb.to(device)
                            out = model(xb)
                            if isinstance(out, dict) and "out" in out:
                                out = out["out"]
                            loss = loss_fn(out, yb)
                            val_loss += loss.item()
                            val_steps += 1
                            preds = torch.argmax(out, dim=1)
                            val_iou += compute_iou_batch(preds.cpu(), yb.cpu(), n_classes)
                            conf, prec, rec, f1 = compute_metrics_batch(preds, yb, n_classes)
                            epoch_confusion_abs += conf
                            epoch_precisions.append(prec)
                            epoch_recalls.append(rec)
                            epoch_f1s.append(f1)

                    row_sums = epoch_confusion_abs.sum(axis=1, keepdims=True)
                    epoch_confusion_pct = np.where(row_sums > 0, epoch_confusion_abs / row_sums * 100.0, 0.0)
                    all_confusion_matrices.append(epoch_confusion_pct.tolist())

                    avg_val_loss = val_loss / max(1, val_steps)
                    avg_val_iou = val_iou / max(1, val_steps)
                    avg_precision = float(np.mean(epoch_precisions)) if epoch_precisions else 0.0
                    avg_recall = float(np.mean(epoch_recalls)) if epoch_recalls else 0.0
                    avg_f1 = float(np.mean(epoch_f1s)) if epoch_f1s else 0.0
                    epoch_duration = round(time.time() - epoch_start, 3)

                    epoch_record = {
                        "epoch": epoch,
                        "batch_size": batch_size,
                        "duration_seconds": epoch_duration,
                        "loss": round(float(avg_train_loss), 6),
                        "val_loss": round(float(avg_val_loss), 6),
                        "accuracy": None,
                        "val_accuracy": None,
                        "iou": round(float(avg_val_iou), 6),
                        "val_iou": round(float(avg_val_iou), 6),
                        "precision": round(float(avg_precision), 6),
                        "recall": round(float(avg_recall), 6),
                        "f1": round(float(avg_f1), 6),
                    }

                    state.epoch_history.append(epoch_record)
                    state.current_epoch = epoch

                    loss_val = epoch_record.get("loss")
                    iou_val = epoch_record.get("iou")
                    if loss_val is not None and (state.best_loss is None or loss_val < state.best_loss):
                        state.best_loss = loss_val
                    if iou_val is not None and (state.best_iou is None or iou_val > state.best_iou):
                        state.best_iou = iou_val

                    progress = EpochProgress(
                        experiment_id=state.id,
                        epoch=epoch,
                        total_epochs=state.epochs,
                        status=state.status,
                        duration_seconds=epoch_duration,
                        loss=epoch_record.get("loss"),
                        val_loss=epoch_record.get("val_loss"),
                        iou=epoch_record.get("iou"),
                        val_iou=epoch_record.get("val_iou"),
                    )
                    state.notify(progress)
                    _persist_experiment(state)

                print('terminó')

                # Confusion: recortar índice 0 (background), quedarse con clases 1..n
                if all_confusion_matrices:
                    full_matrix = all_confusion_matrices[-1]
                    state._confusion_matrix = [row[1:] for row in full_matrix[1:]]
                state._confusion_class_names = display_class_names

                # Distribución: contar imágenes que CONTIENEN cada clase no-background
                image_class_counts = [0] * n_classes
                for _, mask_np in pairs:
                    present_classes = np.unique(mask_np)
                    for cls in present_classes:
                        if 0 <= cls < n_classes:
                            image_class_counts[int(cls)] += 1

                state._dataset_distribution = [
                    {"name": all_class_names[i], "value": image_class_counts[i]}
                    for i in range(1, n_classes)  # desde 1: excluir background
                ]

                # Guardar checkpoint
                try:
                    print('registrando modelo entrenado...')
                    from app.core.supabase_client import get_supabase_client
                    from app.services.registry import get_model_registry
                    import io as _io

                    supabase = get_supabase_client()
                    registry = get_model_registry(supabase)
                    buffer = _io.BytesIO()
                    torch.save({"model_state_dict": model.state_dict()}, buffer)
                    buffer.seek(0)
                    artifact_bytes = buffer.getvalue()
                    filename = f"{state.id}.pth"

                    model_record = registry.register_model(
                        name=state.name or f"trained-{state.id}",
                        version="1",
                        artifact_data=artifact_bytes,
                        filename=filename,
                        framework="pytorch",
                        classes=all_class_names,
                        uploaded_by=state.user_id,
                        architecture=architecture,
                        artifact_type="weights",
                        config={"encoder": encoder, "in_channels": 3, "input_size": preprocess_size},
                    )
                    state.model_id = model_record.id
                    print(f"[TRAINING] Modelo registrado con ID: {model_record.id}")
                except Exception as reg_exc:
                    from pathlib import Path as _Path
                    model_dir = _Path(__file__).resolve().parents[2] / "models"
                    model_dir.mkdir(parents=True, exist_ok=True)
                    torch.save({"model_state_dict": model.state_dict()}, model_dir / f"{state.id}.pth")
                    print(f"[TRAINING] Warning: registry falló, guardado en disco: {reg_exc}")

                state.status = TrainingStatus.COMPLETED
                state.finished_at = _now_iso()
                state.notify()
                _persist_experiment(state)

            except Exception as exc:
                print(f"[TRAINING] FALLO: {exc}")
                state.status = TrainingStatus.FAILED
                state.error = str(exc)
                state.finished_at = _now_iso()
                state.notify()
                _persist_experiment(state)

_training_service = TrainingService(max_workers=2)



def get_training_service() -> TrainingService:
    return _training_service