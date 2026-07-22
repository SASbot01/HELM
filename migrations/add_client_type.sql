-- Add client_type column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text DEFAULT 'growth';

-- Set admin for black-wolf
UPDATE clients SET client_type = 'admin' WHERE slug = 'black-wolf';
