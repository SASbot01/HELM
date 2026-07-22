-- 051_webinar_call_intake.sql
-- Cuestionario gate de agendamiento (4 secciones) que rellenan los asistentes
-- al webinar antes de reservar slot con Portillo o Lukas.

CREATE TABLE IF NOT EXISTS asesoriasuiza_webinar_call_intake (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner           text NOT NULL CHECK (owner IN ('portillo', 'lukas')),

  -- 01 · Datos de contacto
  nombre          text NOT NULL,
  telefono        text NOT NULL,
  email           text,

  -- 02 · Tu situación
  ubicacion       text NOT NULL CHECK (ubicacion IN ('spain', 'switzerland')),

  -- 03 · Tu salto a Suiza
  motivo          text,
  intentos_previos text, -- 'no_solo' | 'experiencia' | 'primera'
  incorporacion   text,  -- 'menos_2s' | '1_mes' | 'mas_1_mes'
  responsabilidades text, -- 'si' | 'no'
  intencion       text,  -- 'decidido' | 'serio' | 'explorando'

  -- 04 · Compromiso
  inversion       text,  -- 'preparado' | 'saber_mas' | 'sin_presupuesto'

  -- Tracking
  contact_id      uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  signup_id       uuid REFERENCES asesoriasuiza_webinar_signups(id) ON DELETE SET NULL,
  booking_status  text DEFAULT 'pending', -- 'pending' | 'booked' | 'cancelled'
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aci_owner_created ON asesoriasuiza_webinar_call_intake (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aci_status ON asesoriasuiza_webinar_call_intake (booking_status);
