-- Add gestor de tienda fields to team table
ALTER TABLE team ADD COLUMN IF NOT EXISTS is_gestor BOOLEAN DEFAULT false;
ALTER TABLE team ADD COLUMN IF NOT EXISTS gestor_commission_rate NUMERIC(5,3) DEFAULT 0;
ALTER TABLE team ADD COLUMN IF NOT EXISTS gestor_start_date DATE;
ALTER TABLE team ADD COLUMN IF NOT EXISTS gestor_capacity INTEGER DEFAULT 8;
