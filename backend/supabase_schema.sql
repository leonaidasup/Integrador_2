-- =====================================================================
-- AI Segmentation Service – Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================================

-- ── Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('user', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Models ─────────────────────────────────────────────────────────────
-- Tabla usada por ModelRegistry (backend/app/services/registry.py).
-- IMPORTANTE: el schema original tenía "is_active" y le faltaban ~10
-- columnas que el código necesita. Esta versión es la correcta.
CREATE TABLE IF NOT EXISTS public.models (
    -- Identidad
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT        NOT NULL,
    version                 TEXT        NOT NULL,
    description             TEXT,

    -- Artefacto
    framework               TEXT        NOT NULL,           -- 'keras' | 'pytorch'
    architecture            TEXT,                           -- 'keras' | 'pytorch' | 'mask_rcnn'
    artifact_type           TEXT        NOT NULL DEFAULT 'full_model'
                                            CHECK (artifact_type IN ('full_model', 'weights')),
    artifact_path           TEXT        NOT NULL,           -- ruta relativa al directorio models/

    -- Metadatos de inferencia
    classes                 JSONB       NOT NULL DEFAULT '[]',
    config                  JSONB       NOT NULL DEFAULT '{}',

    -- Estado
    active                  BOOLEAN     NOT NULL DEFAULT false,
    last_activation_status  TEXT,                           -- 'active' | 'failed' | NULL
    last_activation_error   TEXT,

    -- Trazabilidad
    mlflow_run_id           TEXT,
    run_metadata            JSONB       NOT NULL DEFAULT '{}',
    uploaded_by             TEXT,

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Datasets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.datasets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    image_count INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Experiments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.experiments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    model_id    UUID        NOT NULL REFERENCES public.models(id)   ON DELETE CASCADE,
    dataset_id  UUID        NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    description TEXT,
    config      JSONB,
    status      TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','running','completed','failed','paused')),
    results     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS: deshabilitado (el backend usa service key) ───────────────────
ALTER TABLE public.users       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.models      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments DISABLE ROW LEVEL SECURITY;

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email            ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_models_active          ON public.models(active);
CREATE INDEX IF NOT EXISTS idx_experiments_model_id   ON public.experiments(model_id);
CREATE INDEX IF NOT EXISTS idx_experiments_dataset_id ON public.experiments(dataset_id);

-- Un dataset es una colección de imágenes, propiedad de un usuario
CREATE TABLE public.datasets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,   -- dueño
    name        TEXT        NOT NULL,
    description TEXT,
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    image_count INTEGER     NOT NULL DEFAULT 0,
    version     TEXT        NOT NULL DEFAULT '1.0.0',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada imagen dentro de un dataset
CREATE TABLE public.images (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id   UUID        NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    filename     TEXT        NOT NULL,
    storage_path TEXT        NOT NULL,   -- ruta en Supabase Storage
    width        INTEGER,
    height       INTEGER,
    format       TEXT,                   -- 'png' | 'tiff' | 'jpeg'
    size_bytes   INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada segmentación: imagen + modelo + resultado
CREATE TABLE public.segmentations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id        UUID        NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
    model_id        UUID        NOT NULL REFERENCES public.models(id),
    user_id         UUID        NOT NULL,
    -- rutas en Storage
    mask_path       TEXT        NOT NULL,   -- PNG de clase por pixel (uint8)
    overlay_path    TEXT,                   -- PNG overlay opcional
    -- metadata de resultado
    classes_present TEXT[]      NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION increment_image_count(ds_id UUID)
RETURNS void AS $$
  UPDATE public.datasets SET image_count = image_count + 1, updated_at = now()
  WHERE id = ds_id;
$$ LANGUAGE sql;

CREATE TABLE IF NOT EXISTS public.experiments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    model_id    UUID        NOT NULL REFERENCES public.models(id)   ON DELETE CASCADE,
    dataset_id  UUID        NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    description TEXT,
    config      JSONB       DEFAULT '{}',
    status      TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','running','completed','failed','paused')),
    results     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_model_id
ON public.experiments(model_id);

CREATE INDEX IF NOT EXISTS idx_experiments_dataset_id
ON public.experiments(dataset_id);

ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS error TEXT;

ALTER TABLE public.experiments
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE segmentations ALTER COLUMN model_id DROP NOT NULL;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS architecture TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS encoder TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS best_accuracy FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS best_loss FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS best_iou FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS final_loss FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS final_iou FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS final_accuracy FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS epochs_planned INTEGER;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS epochs_completed INTEGER;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS total_duration_seconds FLOAT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS epoch_history JSONB;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS hyperparameters JSONB;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS dataset_id TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS model_id TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE experiments DROP CONSTRAINT experiments_status_check;
ALTER TABLE experiments ADD CONSTRAINT experiments_status_check 
CHECK (status = ANY (ARRAY['pending', 'queued', 'running', 'completed', 'failed', 'paused', 'cancelled']));