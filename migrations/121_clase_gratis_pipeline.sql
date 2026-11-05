-- 121 — Embudo «Clase gratis» del perfil silvestre.
--
-- Aquí entra quien rellena el lead magnet del QCC en la clase gratis
-- (helm.s4sf.net/clase → api/leads.js ?action=clase-qcc). Llegan con nombre,
-- correo y WhatsApp, más todas sus respuestas del QCC en custom_fields.clase_qcc
-- y una etiqueta con su nivel de ticket (ticket:low|medium|high) para enrutarlos
-- como en los funnels de la clase: low → checkout, medium → setter/formación,
-- high → setting/agenda.
--
-- Idempotente: si el embudo ya existe, no se toca. (Ya se creó a mano el
-- 2026-11-05; esta migración deja el entorno reproducible.)

DO $$
DECLARE
  perfil_id uuid;
BEGIN
  SELECT id INTO perfil_id FROM clients WHERE slug = 'silvestre' LIMIT 1;
  IF perfil_id IS NULL THEN
    RAISE NOTICE 'No existe el perfil silvestre: no se crea el embudo.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = perfil_id AND name = 'Clase gratis') THEN
    RAISE NOTICE 'El embudo "Clase gratis" ya existe: no se toca.';
    RETURN;
  END IF;

  INSERT INTO crm_pipelines (client_id, name, is_default, stages)
  VALUES (
    perfil_id,
    'Clase gratis',
    false,
    '[
      {"key":"nuevo","label":"Nuevo","color":"#A62B46","description":"Acaba de rellenar el QCC en la clase gratis. Lleva nombre, correo, WhatsApp y sus respuestas en custom_fields.clase_qcc."},
      {"key":"contactado","label":"Contactado","color":"#F59E0B","description":"Primer contacto hecho."},
      {"key":"cualificado","label":"Cualificado","color":"#6366F1","description":"Encaja y quiere avanzar."},
      {"key":"agendado","label":"Clase / llamada agendada","color":"#0EA5E9","description":"Tiene hueco reservado."},
      {"key":"cliente","label":"Cliente","color":"#22C55E","description":"Ha comprado."},
      {"key":"descartado","label":"Descartado","color":"#9CA3AF","description":"No encaja o no responde. No se borra: se marca."}
    ]'::jsonb
  );

  RAISE NOTICE 'Embudo "Clase gratis" creado en el perfil silvestre.';
END $$;
