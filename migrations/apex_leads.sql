-- APEX landing — leads capturados desde el side panel "Get Started" en /
-- Tabla independiente del CRM por cliente. Pipeline interno de Black Wolf
-- para triagear contactos a APEX antes de meterlos en cualquier flujo de venta.

CREATE TABLE IF NOT EXISTS apex_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  business_email  TEXT NOT NULL,
  phone           TEXT NOT NULL,
  job_title       TEXT NOT NULL,
  company         TEXT NOT NULL,
  country         TEXT NOT NULL,
  project         TEXT,
  source          TEXT NOT NULL DEFAULT 'apex-landing',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  referrer        TEXT,
  user_agent      TEXT,
  status          TEXT NOT NULL DEFAULT 'new',
  notes           TEXT,
  contacted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apex_leads_status     ON apex_leads(status);
CREATE INDEX IF NOT EXISTS idx_apex_leads_created_at ON apex_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apex_leads_email      ON apex_leads(business_email);

CREATE OR REPLACE FUNCTION apex_leads_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apex_leads_updated_at ON apex_leads;
CREATE TRIGGER apex_leads_updated_at
  BEFORE UPDATE ON apex_leads
  FOR EACH ROW EXECUTE FUNCTION apex_leads_set_updated_at();
