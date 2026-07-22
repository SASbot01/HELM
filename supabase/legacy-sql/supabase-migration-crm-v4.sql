-- CRM V4 Migration: Add sales-mapped fields to contacts for direct sale registration
-- Run this in Supabase SQL Editor

-- Lead Profile fields
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS producto_interes text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS capital_disponible text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS situacion_actual text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS exp_amazon text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS decisor_confirmado text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS fecha_llamada date;

-- UTM & Attribution fields
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS triager text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS gestor_asignado text;

-- Payment preference fields
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS payment_method text;
