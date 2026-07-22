-- Pipeline dedicado para campañas de cold email outbound en BlackWolf.
-- Stages pensados para el flujo: scrape → personalización → envío → respuesta → demo → cierre.

DO $$
DECLARE
  bw_id uuid;
BEGIN
  SELECT id INTO bw_id FROM clients WHERE slug = 'black-wolf';
  IF bw_id IS NULL THEN RAISE EXCEPTION 'black-wolf client missing'; END IF;

  DELETE FROM crm_pipelines
   WHERE client_id = bw_id AND name = 'Email Marketing';

  INSERT INTO crm_pipelines (client_id, name, stages, is_default) VALUES (
    bw_id,
    'Email Marketing',
    '[
      {"key":"scraped",       "label":"Scrapeado",     "color":"#737373"},
      {"key":"enriched",      "label":"Enriquecido",   "color":"#3B82F6"},
      {"key":"email_ready",   "label":"Email listo",   "color":"#8B5CF6"},
      {"key":"sent",          "label":"Enviado",       "color":"#C4A2F7"},
      {"key":"opened",        "label":"Abierto",       "color":"#7CE3FF"},
      {"key":"replied",       "label":"Respondió",     "color":"#F0C674"},
      {"key":"booked",        "label":"Demo agendada", "color":"#7ED4A5"},
      {"key":"won",           "label":"Cerrado",       "color":"#10B981"},
      {"key":"no_fit",        "label":"No encaja",     "color":"#E69595"},
      {"key":"bounced",       "label":"Rebotado",      "color":"#EF4444"}
    ]'::jsonb,
    false
  );
END $$;
