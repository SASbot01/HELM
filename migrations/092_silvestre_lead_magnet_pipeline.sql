-- 092 — Embudo «Lead magnet» del perfil silvestre.
--
-- Aquí entra quien deja sus datos en AI para todo para descargarse la guía en
-- PDF «Mis 8 no negociables con Claude» (s4sf.net/nonegociables, que lleva a
-- /aiparatodo/guia/no-negociables/…). Llegan solos: nombre, correo, profesión
-- e ingresos al mes (custom_fields.aiparatodo) y las UTM del enlace.
--
-- Quien deja sus datos desde cualquier otro hilo de AI para todo entra en
-- «Página de inicio», como hasta ahora.
--
-- Idempotente: si el embudo ya existe, no se toca.

DO $$
DECLARE
  perfil_id uuid;
BEGIN
  SELECT id INTO perfil_id FROM clients WHERE slug = 'silvestre' LIMIT 1;
  IF perfil_id IS NULL THEN
    RAISE NOTICE 'No existe el perfil silvestre: no se crea el embudo.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = perfil_id AND name = 'Lead magnet') THEN
    RAISE NOTICE 'El embudo "Lead magnet" ya existe: no se toca.';
    RETURN;
  END IF;

  INSERT INTO crm_pipelines (client_id, name, is_default, stages)
  VALUES (
    perfil_id,
    'Lead magnet',
    false,
    '[
      {"key":"lead_nuevo","label":"Lead nuevo","color":"#A62B46","description":"Ha dejado sus datos para descargar la guía en PDF. Llegan solos: nombre, correo, profesión, ingresos y UTM."},
      {"key":"contactado","label":"Contactado","color":"#F59E0B","description":"Se le ha escrito después de la descarga."},
      {"key":"cualificado","label":"Cualificado","color":"#8B5CF6","description":"Encaja: interés real, momento y perfil."},
      {"key":"llamada_agendada","label":"Llamada agendada","color":"#3B82F6","description":"Tiene hueco en el calendario."},
      {"key":"cliente","label":"Cliente","color":"#22C55E","description":"Ha comprado."},
      {"key":"descartado","label":"Descartado","color":"#71717A","description":"No encaja, rebota el correo o pidió salir. No se borra: se marca."}
    ]'::jsonb
  );

  RAISE NOTICE 'Embudo "Lead magnet" creado en el perfil silvestre.';
END $$;
