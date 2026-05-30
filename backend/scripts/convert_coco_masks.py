"""
Script para convertir anotaciones COCO a máscaras PNG y registrarlas en Supabase.

Uso:
    cd backend
    python scripts/convert_coco_masks.py --json ruta/annotations.json --dataset 8f0212cb-5494-495e-ae95-acc07d153571
"""

import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from PIL import Image
from pycocotools.coco import COCO

from app.core.supabase_client import get_supabase_client

# Ajusta según tus categorías COCO
# Corre esto para verlas:
# python -c "from pycocotools.coco import COCO; c=COCO('annotations.json'); print(c.loadCats(c.getCatIds()))"
CATEGORY_TO_CLASS = {
    1: 1,  # few-layer
    2: 2,  # bulk
}


def convert(coco_json_path: str, dataset_id: str):
    db = get_supabase_client()
    coco = COCO(coco_json_path)

    # Traer imágenes del dataset desde Supabase
    res = db.table("images").select("id, filename, storage_path").eq("dataset_id", dataset_id).execute()
    image_records = res.data or []

    if not image_records:
        print(f"❌ No se encontraron imágenes para dataset_id={dataset_id}")
        return

    print(f"✓ {len(image_records)} imágenes encontradas en Supabase")

    # Indexar imágenes COCO por filename
    coco_imgs_by_name = {img["file_name"]: img for img in coco.loadImgs(coco.getImgIds())}

    print(f"✓ {len(coco_imgs_by_name)} imágenes encontradas en COCO JSON")
    print(f"  Ejemplo COCO filename: {list(coco_imgs_by_name.keys())[0]}")
    print(f"  Ejemplo Supabase filename: {image_records[0]['filename']}")

    ok, skipped, failed = 0, 0, 0

    for rec in image_records:
        filename = rec["filename"]
        coco_img = coco_imgs_by_name.get(filename)

        if not coco_img:
            print(f"  ⚠ Sin entrada COCO para: {filename}")
            skipped += 1
            continue

        ann_ids = coco.getAnnIds(imgIds=coco_img["id"])
        anns = coco.loadAnns(ann_ids)

        if not anns:
            print(f"  ⚠ Sin anotaciones para: {filename}")
            skipped += 1
            continue

        try:
            h, w = coco_img["height"], coco_img["width"]
            mask = np.zeros((h, w), dtype=np.uint8)

            for ann in anns:
                class_id = CATEGORY_TO_CLASS.get(ann["category_id"], ann["category_id"])
                rle_mask = coco.annToMask(ann)
                mask[rle_mask > 0] = class_id

            # Convertir a PNG en memoria
            buf = io.BytesIO()
            Image.fromarray(mask, mode="L").save(buf, format="PNG")
            mask_bytes = buf.getvalue()

            # Subir a Supabase Storage
            mask_path = f"masks/{dataset_id}/{rec['id']}.png"
            try:
                db.storage.from_("masks").upload(
                    mask_path,
                    mask_bytes,
                    {"content-type": "image/png", "upsert": "true"},
                )
            except Exception:
                # Si ya existe, actualizar
                db.storage.from_("masks").update(
                    mask_path,
                    mask_bytes,
                    {"content-type": "image/png"},
                )

            # Registrar en tabla segmentations
            db.table("segmentations").upsert({
                "image_id": rec["id"],
                "mask_path": mask_path,
            }).execute()

            print(f"  ✓ {filename}")
            ok += 1

        except Exception as e:
            print(f"  ❌ Error en {filename}: {e}")
            failed += 1

    print(f"\nResultado: {ok} convertidas, {skipped} sin anotación, {failed} errores")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", required=True, help="Ruta al archivo annotations.json de COCO")
    parser.add_argument("--dataset", required=True, help="dataset_id en Supabase")
    args = parser.parse_args()

    convert(args.json, args.dataset)