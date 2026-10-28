-- HELM — embudo "Página de inicio" para el perfil silvestre.
--
-- La masterclass de www.s4sf.net/paginainicio manda los leads al CRM del
-- perfil `silvestre` (src/pages/inicio/crm.js), a un pipeline propio y NO al
-- de ventas: nadie de aquí ha hablado todavía con nadie, así que sus etapas
-- no son las de un embudo de ventas. Mezclarlos habría sido un pipeline con
-- doscientos "leads" que en realidad son suscriptores, y un comercial que
-- deja de mirarlo.
--
-- Las etapas son las de la rama evergreen del sistema de captación, en el
-- orden en que ocurren de verdad:
--
--   deja el email → se le entrega el recurso → alguien lo mira y decide si
--   califica → llamada → cliente
--
-- Idempotente: si el embudo ya existe (por nombre, en el perfil silvestre) no
-- se toca — evita duplicar o resetear etapas de contactos que ya estén
-- circulando por él.
DO $$
DECLARE
  perfil_id uuid;
BEGIN
  SELECT id INTO perfil_id FROM clients WHERE slug = 'silvestre' LIMIT 1;
  IF perfil_id IS NULL THEN
    RAISE EXCEPTION 'No existe ningún perfil con slug=silvestre. Créalo antes en HELM.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM crm_pipelines WHERE client_id = perfil_id AND name = 'Página de inicio'
  ) THEN
    RAISE NOTICE 'El embudo "Página de inicio" ya existe en el perfil silvestre: no se toca.';
    RETURN;
  END IF;

  INSERT INTO crm_pipelines (client_id, name, is_default, stages)
  VALUES (
    perfil_id,
    'Página de inicio',
    -- No es el embudo por defecto: el de ventas manda. Este recoge, no cierra.
    false,
    '[
      {"key":"lead_nuevo","label":"Lead nuevo","color":"#A62B46","description":"Ha dejado su email en la página de inicio. Todavía no ha hablado con nadie. Campos que llegan solos: nombre, email y las UTM del enlace por el que entró."},
      {"key":"recurso_entregado","label":"Recurso entregado","color":"#F59E0B","description":"Se le ha mandado lo que venía a buscar y está en la secuencia de nutrición. Aquí se queda hasta que dé una señal (responde, entra en una sesión, pregunta precio)."},
      {"key":"cualificado","label":"Cualificado","color":"#8B5CF6","description":"Alguien lo ha mirado a mano y encaja: interés real, momento y perfil. Es el filtro que evita agendar llamadas con toda la lista."},
      {"key":"llamada_agendada","label":"Llamada agendada","color":"#3B82F6","description":"Tiene hueco en el calendario. Campos: fecha, canal y de qué se va a hablar."},
      {"key":"cliente","label":"Cliente","color":"#22C55E","description":"Ha comprado. Salió de la página de inicio: esta es la etapa que dice si el enlace de la bio sirve para algo."},
      {"key":"nurturing","label":"En nurturing","color":"#64748B","description":"Estado transversal — sigue en la lista, no es el momento. Se vuelve a mirar cuando haya lanzamiento."},
      {"key":"descartado","label":"Descartado","color":"#71717A","description":"Estado transversal — no encaja, rebota el correo o pidió salir. No se borra: se marca, para no volver a contarlo como lead nuevo."}
    ]'::jsonb
  );

  RAISE NOTICE 'Embudo "Página de inicio" creado en el perfil silvestre.';
END $$;
