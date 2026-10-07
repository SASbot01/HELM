-- 094_apex_growth_pipeline_and_host.sql
--
-- Funnel growth.apex-aio.com → tenant APEX en central.blackwolfsec.io/apex/landing.
--   1) Crea pipeline "Apex Growth — Inbound" para tenant apex con stages
--      lead → contactado → agendado → show → cerrado → no_show → perdido
--   2) Crea booking_host Laurent (laurent@apex-aio.com) ligado a ese pipeline
--      via target_pipeline_slug + target_stage_key = 'agendado'.
--
-- Idempotente. Depende de:
--   • 080_apex_client.sql (tenant 'apex' existe)
--   • supabase/legacy-sql/supabase-migration-booking-hosts.sql (tabla booking_hosts)
--   • 055_booking_host_target_pipeline.sql (columnas target_*)
--
-- ROLLBACK:
--   DELETE FROM booking_hosts WHERE client_id=(SELECT id FROM clients WHERE slug='apex') AND slug='laurent';
--   DELETE FROM crm_pipelines WHERE client_id=(SELECT id FROM clients WHERE slug='apex') AND name='Apex Growth — Inbound';

DO $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE slug = 'apex' LIMIT 1;
  IF v_client_id IS NULL THEN
    RAISE NOTICE 'Tenant apex no existe — corre antes 080_apex_client.sql';
    RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- 1) Pipeline "Apex Growth — Inbound"
  ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE client_id = v_client_id AND name = 'Apex Growth — Inbound') THEN
    UPDATE crm_pipelines
      SET stages = '[
        {"key": "lead",       "label": "Lead",            "color": "#F37C34"},
        {"key": "contactado", "label": "Contactado",      "color": "#F59E0B"},
        {"key": "agendado",   "label": "Llamada Agendada","color": "#3B82F6"},
        {"key": "show",       "label": "Asistió",         "color": "#8B5CF6"},
        {"key": "cerrado",    "label": "Cerrado",         "color": "#10B981"},
        {"key": "no_show",    "label": "No Show",         "color": "#94A3B8"},
        {"key": "perdido",    "label": "Perdido",         "color": "#EF4444"}
      ]'::jsonb
      WHERE client_id = v_client_id AND name = 'Apex Growth — Inbound';
    RAISE NOTICE 'Pipeline "Apex Growth — Inbound" actualizado';
  ELSE
    INSERT INTO crm_pipelines (client_id, name, stages, is_default)
    VALUES (
      v_client_id,
      'Apex Growth — Inbound',
      '[
        {"key": "lead",       "label": "Lead",            "color": "#F37C34"},
        {"key": "contactado", "label": "Contactado",      "color": "#F59E0B"},
        {"key": "agendado",   "label": "Llamada Agendada","color": "#3B82F6"},
        {"key": "show",       "label": "Asistió",         "color": "#8B5CF6"},
        {"key": "cerrado",    "label": "Cerrado",         "color": "#10B981"},
        {"key": "no_show",    "label": "No Show",         "color": "#94A3B8"},
        {"key": "perdido",    "label": "Perdido",         "color": "#EF4444"}
      ]'::jsonb,
      true
    );
    RAISE NOTICE 'Pipeline "Apex Growth — Inbound" creado';
  END IF;

  ----------------------------------------------------------------------------
  -- 2) Booking host: Laurent
  --    Routea automáticamente a "Apex Growth — Inbound" stage 'agendado'.
  ----------------------------------------------------------------------------
  INSERT INTO booking_hosts (
    client_id, slug, name, role, description, email,
    duration_minutes, google_account_index, host_type, team_members,
    is_active, position,
    target_pipeline_slug, target_stage_key
  ) VALUES (
    v_client_id, 'laurent', 'Laurent', 'Founder · APEX Growth',
    'Demo consultiva 1:1 — analizamos cuellos de botella operativos y cómo APEX puede escalar tu facturación.',
    'laurent@apex-aio.com',
    30, 1, 'individual', '[]'::jsonb,
    true, 1,
    'Apex Growth — Inbound', 'agendado'
  )
  ON CONFLICT (client_id, slug) DO UPDATE SET
    name                  = EXCLUDED.name,
    role                  = EXCLUDED.role,
    description           = EXCLUDED.description,
    email                 = EXCLUDED.email,
    duration_minutes      = EXCLUDED.duration_minutes,
    google_account_index  = EXCLUDED.google_account_index,
    host_type             = EXCLUDED.host_type,
    team_members          = EXCLUDED.team_members,
    is_active             = EXCLUDED.is_active,
    position              = EXCLUDED.position,
    target_pipeline_slug  = EXCLUDED.target_pipeline_slug,
    target_stage_key      = EXCLUDED.target_stage_key,
    updated_at            = now();
  RAISE NOTICE 'Booking host "laurent" upsertado para tenant apex';
END $$;
