-- 050_asesoriasuiza_webinar.sql
-- Webinar Suiza (Portillo + Lukas) y bifurcación post-webinar.
-- Stages viven como JSONB array dentro de crm_pipelines.stages
-- (no hay tabla crm_pipeline_stages en este schema).

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'asesorias-suiza' LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE NOTICE 'cliente asesorias-suiza no existe — saltando creación de pipelines';
    RETURN;
  END IF;

  -- Webinar pipelines (idempotente: solo inserta si no existe el name+client)
  INSERT INTO crm_pipelines (client_id, name, owner_scope, stages, is_default)
  SELECT v_client_id, 'FormWebinarPortillo', 'portillo',
    jsonb_build_array(
      jsonb_build_object('key', 'inscrito',  'color', '#6B7280', 'label', 'Inscrito'),
      jsonb_build_object('key', 'asistio',   'color', '#3B82F6', 'label', 'Asistió'),
      jsonb_build_object('key', 'no_show',   'color', '#EF4444', 'label', 'No-show'),
      jsonb_build_object('key', 'agendada',  'color', '#FFB800', 'label', '📞 Agendó llamada'),
      jsonb_build_object('key', 'cliente',   'color', '#15A34A', 'label', 'Cliente')
    ), false
  WHERE NOT EXISTS (
    SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'FormWebinarPortillo'
  );

  INSERT INTO crm_pipelines (client_id, name, owner_scope, stages, is_default)
  SELECT v_client_id, 'FormWebinarLukas', 'lukas',
    jsonb_build_array(
      jsonb_build_object('key', 'inscrito',  'color', '#6B7280', 'label', 'Inscrito'),
      jsonb_build_object('key', 'asistio',   'color', '#3B82F6', 'label', 'Asistió'),
      jsonb_build_object('key', 'no_show',   'color', '#EF4444', 'label', 'No-show'),
      jsonb_build_object('key', 'agendada',  'color', '#FFB800', 'label', '📞 Agendó llamada'),
      jsonb_build_object('key', 'cliente',   'color', '#15A34A', 'label', 'Cliente')
    ), false
  WHERE NOT EXISTS (
    SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'FormWebinarLukas'
  );

  -- Establecimiento pipelines (path "ya tengo trabajo")
  INSERT INTO crm_pipelines (client_id, name, owner_scope, stages, is_default)
  SELECT v_client_id, 'EstablecimientoPortillo', 'portillo',
    jsonb_build_array(
      jsonb_build_object('key', 'lead',             'color', '#6B7280', 'label', 'Lead'),
      jsonb_build_object('key', 'datos_completos', 'color', '#8B5CF6', 'label', 'Datos completos'),
      jsonb_build_object('key', 'anmeldung',       'color', '#F59E0B', 'label', 'Anmeldung'),
      jsonb_build_object('key', 'cliente',         'color', '#15A34A', 'label', 'Cliente')
    ), false
  WHERE NOT EXISTS (
    SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'EstablecimientoPortillo'
  );

  INSERT INTO crm_pipelines (client_id, name, owner_scope, stages, is_default)
  SELECT v_client_id, 'EstablecimientoLukas', 'lukas',
    jsonb_build_array(
      jsonb_build_object('key', 'lead',             'color', '#6B7280', 'label', 'Lead'),
      jsonb_build_object('key', 'datos_completos', 'color', '#8B5CF6', 'label', 'Datos completos'),
      jsonb_build_object('key', 'anmeldung',       'color', '#F59E0B', 'label', 'Anmeldung'),
      jsonb_build_object('key', 'cliente',         'color', '#15A34A', 'label', 'Cliente')
    ), false
  WHERE NOT EXISTS (
    SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'EstablecimientoLukas'
  );
END $$;

-- Tabla de inscripciones al webinar (auditable + payload completo).
CREATE TABLE IF NOT EXISTS asesoriasuiza_webinar_signups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       text NOT NULL CHECK (owner IN ('portillo', 'lukas')),
  nombre      text NOT NULL,
  email       text NOT NULL,
  telefono    text,
  ubicacion   text, -- 'spain' | 'switzerland'
  source      text,
  attended    boolean DEFAULT false,
  contact_id  uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aws_owner_created ON asesoriasuiza_webinar_signups (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aws_email ON asesoriasuiza_webinar_signups (email);

-- Tabla del path "con trabajo" (post-webinar establecimiento).
CREATE TABLE IF NOT EXISTS asesoriasuiza_establecimiento_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner         text NOT NULL CHECK (owner IN ('portillo', 'lukas')),
  nombre        text NOT NULL,
  email         text NOT NULL,
  telefono      text,
  empresa       text,
  ciudad_suiza  text,
  fecha_inicio  date,
  estado_trabajo text,
  anmeldung_url text,
  contact_id    uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aes_owner_created ON asesoriasuiza_establecimiento_submissions (owner, created_at DESC);
