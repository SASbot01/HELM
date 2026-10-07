-- 065 · Fix: routing form 'trabajo-suiza' (asesorias-suiza) no tenía
-- default_stage_key configurado, por lo que los contactos que llenaban el
-- formulario no quedaban en "Propuesta enviada" en el pipeline FormTrabajoPortillo.
--
-- Este migration:
--   1. Asigna default_stage_key = 'propuesta_enviada' al form 'trabajo-suiza'
--      para que todos los leads que lo completen aterricen en esa etapa.
--   2. Asigna default_pipeline_slug = 'FormTrabajoPortillo' como destino CRM
--      por defecto (por si las reglas individuales no lo especifican).
--
-- Rollback:
--   UPDATE booking_routing_forms
--   SET default_stage_key = NULL, default_pipeline_slug = NULL
--   WHERE slug = 'trabajo-suiza'
--     AND client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza');

UPDATE booking_routing_forms
SET
  default_stage_key    = 'propuesta_enviada',
  default_pipeline_slug = 'FormTrabajoPortillo'
WHERE slug      = 'trabajo-suiza'
  AND client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza');
