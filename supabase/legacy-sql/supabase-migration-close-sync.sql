-- ============================================
-- Close CRM Bidirectional Sync for FBA Academy
-- ============================================

-- Sync state tracking
CREATE TABLE IF NOT EXISTS close_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  sync_type text NOT NULL CHECK (sync_type IN ('full', 'incremental', 'webhook', 'push')),
  direction text NOT NULL CHECK (direction IN ('close_to_dashboard', 'dashboard_to_close')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  leads_created integer DEFAULT 0,
  leads_updated integer DEFAULT 0,
  leads_failed integer DEFAULT 0,
  error_details jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(client_id, started_at)
);

CREATE INDEX idx_close_sync_client ON close_sync_log(client_id);
CREATE INDEX idx_close_sync_status ON close_sync_log(status);

-- Add Close IDs to crm_contacts for bidirectional linking
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS close_lead_id text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS close_contact_id text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS close_opportunity_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_close_lead
  ON crm_contacts(close_lead_id) WHERE close_lead_id IS NOT NULL;

-- ============================================
-- Seed FBA Academy Pipelines (matching Close)
-- ============================================

-- Get FBA Academy client_id
DO $$
DECLARE
  fba_client_id uuid;
BEGIN
  SELECT id INTO fba_client_id FROM clients WHERE slug = 'fba-academy' LIMIT 1;

  IF fba_client_id IS NULL THEN
    RAISE NOTICE 'FBA Academy client not found, skipping pipeline seed';
    RETURN;
  END IF;

  -- Pipeline 1: Sales
  INSERT INTO crm_pipelines (id, client_id, name, stages, is_default)
  VALUES (
    gen_random_uuid(),
    fba_client_id,
    'Sales',
    '[
      {"key": "nueva_agenda", "label": "Nueva Agenda", "color": "#6366F1", "close_status_id": "stat_TmrwNnmuCEuuDJ1hQct8s0ZLdwOTUX0VGtOCZg6itI3"},
      {"key": "contactado_1", "label": "Contactado 1", "color": "#8B5CF6", "close_status_id": "stat_x8VpsfjBAzgSGuQfi9lArDOpIkxub5ppM5XC82oRla1"},
      {"key": "contactado_2", "label": "Contactado 2", "color": "#A78BFA", "close_status_id": "stat_7ZFNOX2eHQa3ddRWaHLFUSjYDpIVnN8Vy4XEtvEfTpX"},
      {"key": "contactado_3", "label": "Contactado 3", "color": "#C4B5FD", "close_status_id": "stat_cxMd62sxJ5Monelzd85jlSm1z4ALZdvjkaFYUrdQRVu"},
      {"key": "cualificado", "label": "Cualificado - Ready para Call", "color": "#22D3EE", "close_status_id": "stat_g6j4g526OGRiXcVPD4BUa6StFcMsZeOo7jvQifvFAKz"},
      {"key": "no_cualifica", "label": "No Cualifica", "color": "#EF4444", "close_status_id": "stat_pfVMHk5wsg81HHeP91rqPghKzrupd6bGvCtUJGY2OOB"},
      {"key": "no_show", "label": "No Show", "color": "#F97316", "close_status_id": "stat_fVFjUPJyLUR2U0MJqSTKYcUJWMNfHZOe1bDXXlWKWTX"},
      {"key": "followup_hot", "label": "Follow up - HOT", "color": "#F59E0B", "close_status_id": "stat_2XqHwqMLebUooxZZSyMgz5uOjiBDWOnGuAnHQNIc80j"},
      {"key": "followup_nurture", "label": "Follow up - Nurture", "color": "#84CC16", "close_status_id": "stat_qqVehOgEMurYUX3WuRe5gMVmCkiliUXVCu3Yt3TgS8J"},
      {"key": "fallo_pago", "label": "Follow up - Fallo Pago", "color": "#DC2626", "close_status_id": "stat_nOsq0FD6wArAsXoxNWeIY2MJnaAWd79s9EACgq3s4R2"},
      {"key": "deposito", "label": "Deposito", "color": "#10B981", "close_status_id": "stat_38hDAXP6mNjk9olmILxJ043p1NcU5bNzJ8kCNit8Qbp"},
      {"key": "close_the_deal", "label": "Close the Deal", "color": "#059669", "close_status_id": "stat_cVazairf68ll4IguFbk3rbEm5bjb3pxCAMDHXwvZJ3S"},
      {"key": "cliente", "label": "Cliente", "color": "#14B8A6", "close_status_id": "stat_KAKcWkGXA6Yb6m71iusG7b6UMuQSeNelZXUtJX5RcQ5"},
      {"key": "descartado", "label": "Descartado", "color": "#6B7280", "close_status_id": "stat_QxzCBuXaLN2hs1bdCSlm5hQubvJxXFraL6NhrxSyDLV"}
    ]'::jsonb,
    true
  )
  ON CONFLICT DO NOTHING;

  -- Pipeline 2: Gestores de Tienda
  INSERT INTO crm_pipelines (id, client_id, name, stages, is_default)
  VALUES (
    gen_random_uuid(),
    fba_client_id,
    'Gestores de Tienda',
    '[
      {"key": "pago_recibido", "label": "Pago Recibido", "color": "#10B981", "close_status_id": "stat_QI65iIgnkiflXTUU7uQehwgb7Rid1L6bC8PDOP1HeFY"},
      {"key": "contrato_firmado", "label": "Contrato Firmado", "color": "#6366F1", "close_status_id": "stat_AD56ZyEQYsDWEf554b2ZHe9MP2Naz9sP90pO0POxVjD"},
      {"key": "onboarding", "label": "Onboarding", "color": "#8B5CF6", "close_status_id": "stat_hY5bbnNLW3uOwCpQCmekwPa3D7dNpLxKbot3Heiw66t"},
      {"key": "tienda_en_creacion", "label": "Tienda en Creacion", "color": "#F59E0B", "close_status_id": "stat_GGxZFBnTnQEIcX9nVd5ZQ5MrjiH3xLRu0vum7rKB68S"},
      {"key": "tienda_activa", "label": "Tienda Activa", "color": "#22D3EE", "close_status_id": "stat_fDAGtucDceozh3rYG1jK30qcxgcXnZHINDmGA1YOsYY"},
      {"key": "en_seguimiento", "label": "En Seguimiento", "color": "#84CC16", "close_status_id": "stat_T4PVNFOSbP5pG629jtyuacEsK9m8ukLbMU2fFYyiZgE"},
      {"key": "incidencia", "label": "Incidencia", "color": "#EF4444", "close_status_id": "stat_r5bt7CVZHd9unihpDqITcUHuNk79nrriawlLy17HrI4"},
      {"key": "completado", "label": "Completado", "color": "#14B8A6", "close_status_id": "stat_ZG5mmSLD7UoGhhZpptApENwJtF85LVAANtT2JHiIz1l"}
    ]'::jsonb,
    false
  )
  ON CONFLICT DO NOTHING;

END $$;
