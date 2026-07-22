-- Añade metadata jsonb a email_campaigns para guardar emails personalizados
-- por cada subscriber (clave: "personalized": [{contact_id, email, subject, html}, ...]).
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Añade pipeline_id a crm_contacts si todavía no existe (algunos schemas antiguos no lo tenían)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES crm_pipelines(id);
