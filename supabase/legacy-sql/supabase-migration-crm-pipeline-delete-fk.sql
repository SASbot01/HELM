-- Make crm_contacts.pipeline_id FK detach safely when a pipeline is deleted.
-- Without this, DELETE on crm_pipelines fails silently when any contact still
-- references it (Postgres default is ON DELETE NO ACTION / RESTRICT).

ALTER TABLE crm_contacts
  DROP CONSTRAINT IF EXISTS crm_contacts_pipeline_id_fkey;

ALTER TABLE crm_contacts
  ADD CONSTRAINT crm_contacts_pipeline_id_fkey
  FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id) ON DELETE SET NULL;
