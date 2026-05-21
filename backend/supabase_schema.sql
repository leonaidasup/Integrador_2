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