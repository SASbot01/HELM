-- 103 — Los embudos de Filmmaking para todo en el perfil detras-de-camra.
--
-- Filmmaking para todo (s4sf.net/filmmakingparatodo) es la comunidad de
-- Detrás de Cámara. Quien deja sus cuatro datos entra en el CRM de su perfil
-- (api/leads.js · miembro, con la comunidad de api/_lib/comunidades.js), como
-- en AI para todo:
--
--   · por la guía gratuita en PDF → «Lead magnet»
--   · por cualquier otro hilo     → «Página de inicio»
--
-- Llegan solos: nombre, correo, profesión, ingresos al mes
-- (custom_fields.filmmakingparatodo) y las UTM del enlace. Los dos empiezan en
-- la etapa lead_nuevo, que es donde los deja el alta.
--
-- El slug del perfil lleva la errata de cuando se creó («camra»): es el real.
-- Idempotente: si un embudo ya existe, no se toca.

DO $$
DECLARE
  perfil_id uuid;
BEGIN
  SELECT id INTO perfil_id FROM clients WHERE slug = 'detras-de-camra' LIMIT 1;
  IF perfil_id IS NULL THEN
    RAISE NOTICE 'No existe el perfil detras-de-camra: no se crean los embudos.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = perfil_id AND name = 'Página de inicio') THEN
    RAISE NOTICE 'El embudo "Página de inicio" ya existe: no se toca.';
  ELSE
    INSERT INTO crm_pipelines (client_id, name, is_default, stages)
    VALUES (
      perfil_id,
      'Página de inicio',
      false,
      '[
        {"key":"lead_nuevo","label":"Lead nuevo","color":"#C9A84C","description":"Ha dejado sus datos en Filmmaking para todo para leer un hilo. Todavía no ha hablado con nadie. Llegan solos: nombre, correo, profesión, ingresos y UTM."},
        {"key":"recurso_entregado","label":"Recurso entregado","color":"#F59E0B","description":"Se le ha mandado lo que venía a buscar y está en la secuencia de nutrición. Aquí se queda hasta que dé una señal (responde, entra en una clase, pregunta precio)."},
        {"key":"cualificado","label":"Cualificado","color":"#8B5CF6","description":"Alguien lo ha mirado a mano y encaja: interés real, momento y perfil."},
        {"key":"llamada_agendada","label":"Llamada agendada","color":"#3B82F6","description":"Tiene hueco en el calendario."},
        {"key":"cliente","label":"Cliente","color":"#22C55E","description":"Ha comprado. Salió de la comunidad."},
        {"key":"nurturing","label":"En nurturing","color":"#64748B","description":"Estado transversal: sigue en la lista, no es el momento. Se vuelve a mirar cuando haya lanzamiento."},
        {"key":"descartado","label":"Descartado","color":"#71717A","description":"Estado transversal: no encaja, rebota el correo o pidió salir. No se borra: se marca."}
      ]'::jsonb
    );
    RAISE NOTICE 'Embudo "Página de inicio" creado en detras-de-camra.';
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = perfil_id AND name = 'Lead magnet') THEN
    RAISE NOTICE 'El embudo "Lead magnet" ya existe: no se toca.';
  ELSE
    INSERT INTO crm_pipelines (client_id, name, is_default, stages)
    VALUES (
      perfil_id,
      'Lead magnet',
      false,
      '[
        {"key":"lead_nuevo","label":"Lead nuevo","color":"#C9A84C","description":"Ha dejado sus datos para descargar la guía gratuita en PDF. Llegan solos: nombre, correo, profesión, ingresos y UTM."},
        {"key":"contactado","label":"Contactado","color":"#F59E0B","description":"Se le ha escrito después de la descarga."},
        {"key":"cualificado","label":"Cualificado","color":"#8B5CF6","description":"Encaja: interés real, momento y perfil."},
        {"key":"llamada_agendada","label":"Llamada agendada","color":"#3B82F6","description":"Tiene hueco en el calendario."},
        {"key":"cliente","label":"Cliente","color":"#22C55E","description":"Ha comprado."},
        {"key":"descartado","label":"Descartado","color":"#71717A","description":"No encaja, rebota el correo o pidió salir. No se borra: se marca."}
      ]'::jsonb
    );
    RAISE NOTICE 'Embudo "Lead magnet" creado en detras-de-camra.';
  END IF;
END $$;
