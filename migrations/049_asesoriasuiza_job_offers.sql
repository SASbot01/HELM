-- 049_asesoriasuiza_job_offers.sql
-- Lista de vacantes ofrecidas en /suizatrabajo (Portillo) y /trabajosuiza (Lukas).
-- Sustituye al PDF estático: la landing post-form lee de aquí.

CREATE TABLE IF NOT EXISTS asesoriasuiza_job_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        text NOT NULL CHECK (owner IN ('portillo', 'lukas')),
  titulo       text NOT NULL,
  empresa      text NOT NULL,
  ciudad       text,
  descripcion  text,
  requisitos   text,
  salario      text,
  gmail_contacto text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 100,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asj_owner_active ON asesoriasuiza_job_offers (owner, activo, sort_order);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION asesoriasuiza_job_offers_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asj_touch ON asesoriasuiza_job_offers;
CREATE TRIGGER asj_touch BEFORE UPDATE ON asesoriasuiza_job_offers
  FOR EACH ROW EXECUTE FUNCTION asesoriasuiza_job_offers_touch();
