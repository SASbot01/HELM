-- Migration: Add enabled_features JSONB column to clients table
-- This allows granular per-client feature toggling instead of relying solely on client_type

ALTER TABLE clients ADD COLUMN IF NOT EXISTS enabled_features jsonb DEFAULT NULL;

-- Set default features for existing clients based on their current client_type
-- Growth clients get all standard features
UPDATE clients SET enabled_features = '{
  "ventas": true,
  "reportes": true,
  "crm": true,
  "cuentas": true,
  "tiendas": true,
  "mentorias": true,
  "task_management": true,
  "operations": true,
  "formacion": true,
  "manufacturing": false,
  "marketing": true,
  "ai_agents": true,
  "email_marketing": true,
  "contabilidad": true,
  "proyecciones": true,
  "comisiones": true,
  "productos": true,
  "metodos_pago": true
}'::jsonb WHERE client_type = 'growth' OR (client_type IS NULL AND slug != 'black-wolf');

-- Consultoria clients: CRM-focused
UPDATE clients SET enabled_features = '{
  "ventas": false,
  "reportes": false,
  "crm": true,
  "cuentas": true,
  "tiendas": false,
  "mentorias": false,
  "task_management": false,
  "operations": false,
  "formacion": false,
  "manufacturing": false,
  "marketing": false,
  "ai_agents": true,
  "email_marketing": true,
  "contabilidad": false,
  "proyecciones": false,
  "comisiones": false,
  "productos": false,
  "metodos_pago": false
}'::jsonb WHERE client_type = 'consultoria';

-- Manufactura clients: full + manufacturing
UPDATE clients SET enabled_features = '{
  "ventas": true,
  "reportes": true,
  "crm": true,
  "cuentas": true,
  "tiendas": true,
  "mentorias": true,
  "task_management": true,
  "operations": true,
  "formacion": true,
  "manufacturing": true,
  "marketing": true,
  "ai_agents": true,
  "email_marketing": true,
  "contabilidad": true,
  "proyecciones": true,
  "comisiones": true,
  "productos": true,
  "metodos_pago": true
}'::jsonb WHERE client_type = 'manufactura';

-- Admin (black-wolf): all features
UPDATE clients SET enabled_features = '{
  "ventas": true,
  "reportes": true,
  "crm": true,
  "cuentas": true,
  "tiendas": true,
  "mentorias": true,
  "task_management": true,
  "operations": true,
  "formacion": true,
  "manufacturing": true,
  "marketing": true,
  "ai_agents": true,
  "email_marketing": true,
  "contabilidad": true,
  "proyecciones": true,
  "comisiones": true,
  "productos": true,
  "metodos_pago": true
}'::jsonb WHERE client_type = 'admin' OR slug = 'black-wolf';
