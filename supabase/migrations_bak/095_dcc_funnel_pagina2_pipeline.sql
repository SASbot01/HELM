-- 095_dcc_funnel_pagina2_pipeline.sql
--
-- Pipeline dedicado al funnel detrasdecamara.org/pagina2 (sales letter
-- "Vive del Filmmaking en serio" con form + booking inline al estilo Hugo).
--
-- El form POSTea a /api/forms/dcc-submit con formId="pagina2" y queda
-- enrutado a este pipeline en stage `llamada_agendada` (el form ya incluye
-- la elección de día+hora; el equipo de Abel confirma a mano por WhatsApp).
--
-- Idempotente.
--
-- ROLLBACK:
--   DELETE FROM crm_pipelines
--    WHERE client_id = (SELECT id FROM clients WHERE slug='detras-de-camara')
--      AND name = 'Funnel pagina2';

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'detras-de-camara' LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE NOTICE 'Cliente detras-de-camara no existe — abortando';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'Funnel pagina2') THEN
    UPDATE crm_pipelines
      SET stages = '[
        {"key": "lead",              "label": "Lead",             "color": "#F37C34"},
        {"key": "contactado",        "label": "Contactado",       "color": "#F59E0B"},
        {"key": "llamada_agendada",  "label": "Llamada agendada", "color": "#3B82F6"},
        {"key": "llamada_realizada", "label": "Llamada realizada","color": "#8B5CF6"},
        {"key": "cliente",           "label": "Cliente",          "color": "#10B981"},
        {"key": "no_show",           "label": "No Show",          "color": "#94A3B8"},
        {"key": "perdido",           "label": "Perdido",          "color": "#EF4444"}
      ]'::jsonb
      WHERE client_id = v_client_id AND name = 'Funnel pagina2';
    RAISE NOTICE 'Pipeline "Funnel pagina2" actualizado';
  ELSE
    INSERT INTO crm_pipelines (client_id, name, stages, is_default)
    VALUES (
      v_client_id,
      'Funnel pagina2',
      '[
        {"key": "lead",              "label": "Lead",             "color": "#F37C34"},
        {"key": "contactado",        "label": "Contactado",       "color": "#F59E0B"},
        {"key": "llamada_agendada",  "label": "Llamada agendada", "color": "#3B82F6"},
        {"key": "llamada_realizada", "label": "Llamada realizada","color": "#8B5CF6"},
        {"key": "cliente",           "label": "Cliente",          "color": "#10B981"},
        {"key": "no_show",           "label": "No Show",          "color": "#94A3B8"},
        {"key": "perdido",           "label": "Perdido",          "color": "#EF4444"}
      ]'::jsonb,
      false
    );
    RAISE NOTICE 'Pipeline "Funnel pagina2" creado';
  END IF;
END $$;
