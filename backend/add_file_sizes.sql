-- Add file_size_bytes column to models table
ALTER TABLE public.models 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;

-- Add file_size_bytes column to datasets table
ALTER TABLE public.datasets 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;

-- Populate models with estimated sizes (if NULL/0)
-- Estimations based on framework and type
UPDATE public.models 
SET file_size_bytes = 
  CASE 
    WHEN artifact_type = 'weights' THEN 500000000  -- 500 MB for weights only
    WHEN framework = 'pytorch' THEN 1200000000      -- 1.2 GB for PyTorch full models
    WHEN framework = 'keras' THEN 800000000         -- 800 MB for Keras full models
    ELSE 1000000000                                  -- 1 GB default
  END
WHERE file_size_bytes = 0 OR file_size_bytes IS NULL;

-- Populate datasets with estimated sizes based on image_count
-- Assume average image is ~2MB
UPDATE public.datasets 
SET file_size_bytes = image_count * 2000000  -- 2MB per image
WHERE file_size_bytes = 0 OR file_size_bytes IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_models_file_size ON public.models(file_size_bytes);
CREATE INDEX IF NOT EXISTS idx_datasets_file_size ON public.datasets(file_size_bytes);
