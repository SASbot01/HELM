-- ============================================
-- Drop the legacy CHECK constraint on crm_contacts.status.
-- The kanban UI matches contact.status to stage.key from the active pipeline,
-- and each client now defines its own custom stages (e.g., "nuevo_lead",
-- "primer_contacto", "ghosting"). The hardcoded list ('lead','contacted',
-- 'qualified','proposal','negotiation','won','lost','churned') blocks those.
-- ============================================

ALTER TABLE crm_contacts
  DROP CONSTRAINT IF EXISTS crm_contacts_status_check;
