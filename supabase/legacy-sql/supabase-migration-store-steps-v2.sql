-- Store Steps v2: Add deliverables JSONB column for multiple inputs per step
-- Run after supabase-migration-stores.sql and supabase-migration-stores-v2.sql

-- deliverables: array of { key, label, type, required, value }
-- Example: [{"key":"brand_name","label":"Nombre de marca","type":"text","required":true,"value":""},{"key":"capital","label":"Capital disponible (€)","type":"number","required":true,"value":""}]
ALTER TABLE store_steps ADD COLUMN IF NOT EXISTS deliverables JSONB DEFAULT '[]'::jsonb;
