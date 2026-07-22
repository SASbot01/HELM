-- CRM V3 Migration: Pipeline-linked Smart Views + Role-based Assignments
-- Run this in Supabase SQL Editor

-- 1. Add pipeline_id to smart views so views are tied to a specific pipeline
ALTER TABLE crm_smart_views ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES crm_pipelines(id) ON DELETE SET NULL;

-- 2. Add role-based assignment columns to contacts
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS assigned_closer text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS assigned_setter text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS assigned_cold_caller text;

-- Indexes for the new assignment columns
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_closer ON crm_contacts(assigned_closer);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_setter ON crm_contacts(assigned_setter);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_cold_caller ON crm_contacts(assigned_cold_caller);
CREATE INDEX IF NOT EXISTS idx_crm_smart_views_pipeline ON crm_smart_views(pipeline_id);
