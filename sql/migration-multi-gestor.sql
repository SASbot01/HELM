-- Migration: Support multiple gestores per store
-- Adds gestor_ids (uuid[]) and gestor_names (text[]) array columns

ALTER TABLE stores ADD COLUMN IF NOT EXISTS gestor_ids uuid[] DEFAULT '{}';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS gestor_names text[] DEFAULT '{}';

-- Migrate existing single-gestor data into arrays
UPDATE stores
SET gestor_ids = ARRAY[gestor_id],
    gestor_names = ARRAY[gestor_name]
WHERE gestor_id IS NOT NULL
  AND (gestor_ids IS NULL OR gestor_ids = '{}');
