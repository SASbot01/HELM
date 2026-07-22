-- Routing forms para booking: antes de que el lead agende, contesta un
-- miniform (ej. '¿Cuánto facturas al mes?') y según la respuesta se le asigna
-- a un host u otro. Ejemplo FBA: si monto >= 2000 → Pablo, si no → Manu.
--
-- Este archivo añade la tabla booking_routing_forms; no cambia booking_hosts.
-- El front resuelve la regla antes de abrir el calendario del host.

CREATE TABLE IF NOT EXISTS booking_routing_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  -- Preguntas del form. Formato:
  -- [{ key: 'monto', label: '¿Cuánto facturas?', type: 'number'|'text'|'select',
  --    required: true, options?: ['<2k','2k-10k','>10k'] }, ...]
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Reglas de routing evaluadas EN ORDEN. Primera match gana.
  -- [{ conditions: [{ field:'monto', op:'gte'|'lte'|'equals'|'contains'|'in',
  --                   value: 2000 }], assign_to_host_slug: 'pablo',
  --    stop_on_match: true }, ...]
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Si ninguna regla matchea, se usa este host.
  fallback_host_slug TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_booking_routing_forms_client ON booking_routing_forms (client_id, active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS booking_routing_forms_updated_at ON booking_routing_forms;
CREATE TRIGGER booking_routing_forms_updated_at
  BEFORE UPDATE ON booking_routing_forms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE booking_routing_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON booking_routing_forms;
CREATE POLICY "Allow all for anon" ON booking_routing_forms FOR ALL USING (true) WITH CHECK (true);

-- Tabla para guardar las respuestas y la decisión de routing. Auditoría del
-- matching y útil si un día quieres re-asignar manualmente.
CREATE TABLE IF NOT EXISTS booking_routing_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_form_id UUID REFERENCES booking_routing_forms(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_host_slug TEXT,
  matched_rule_index INT,
  booking_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_routing_responses_form ON booking_routing_responses (routing_form_id, created_at DESC);
