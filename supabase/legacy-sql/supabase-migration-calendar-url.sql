-- Add calendar_url to team table for gestor scheduling links
ALTER TABLE team ADD COLUMN IF NOT EXISTS calendar_url TEXT;
