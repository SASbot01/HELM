-- 021_client_config.sql
-- Panel de configuración por cliente (self-service). Elimina hardcodes
-- `clientSlug === 'black-wolf'` por config editable desde UI.
--
-- NO TOCA fba-academy: su fila mantiene config=NULL y el hook useClientConfig
-- devuelve sentinel legacy para ese slug → el código actual sigue funcionando.

-- ============================================================================
-- Columna `config` en clients — superset de enabled_features
-- ============================================================================
alter table clients
  add column if not exists config jsonb default '{}'::jsonb;

-- Estructura esperada:
-- {
--   "language": "es" | "en",
--   "features": { "crm": true, "ceo_mind": true, ... },  -- alias de enabled_features
--   "branding": { "display_name": "...", "tagline": "...", "domain": "..." },
--   "github": { "repo": "owner/repo", "show_commits": true },
--   "integrations": { "calendly_url": "...", "whatsapp_enabled": true, ... },
--   "labels": { "tiendas_singular": "Cliente" },    -- overrides locales de copy
--   "locked": false  -- si true, cliente no puede editar su config (admin only)
-- }

-- ============================================================================
-- Backfill — solo para clients que NO son fba-academy
-- ============================================================================

-- Enriquecer config.language
update clients
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
  'language', case when slug = 'black-wolf' then 'en' else 'es' end
)
where slug <> 'fba-academy'
  and (config->>'language' is null);

-- Copiar enabled_features → config.features (si existe)
update clients
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
  'features', coalesce(enabled_features, '{}'::jsonb)
)
where slug <> 'fba-academy'
  and enabled_features is not null
  and (config->'features' is null or config->'features' = '{}'::jsonb);

-- Copiar branding desde columnas existentes (logo_url, primary_color, etc.)
update clients
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
  'branding', jsonb_strip_nulls(jsonb_build_object(
    'display_name',       name,
    'logo_url',           logo_url,
    'primary_color',      primary_color,
    'secondary_color',    secondary_color,
    'bg_color',           bg_color,
    'bg_card_color',      bg_card_color,
    'bg_sidebar_color',   bg_sidebar_color,
    'border_color',       border_color,
    'text_color',         text_color,
    'text_secondary_color', text_secondary_color
  ))
)
where slug <> 'fba-academy'
  and (config->'branding' is null or config->'branding' = '{}'::jsonb);

-- black-wolf: tiene un repo GitHub conocido (DevelopingPage/TaskManagement lo hardcodean)
update clients
set config = config || jsonb_build_object(
  'github', jsonb_build_object('repo', 'aatshadow/Dashboard-Ops-', 'show_commits', true)
)
where slug = 'black-wolf'
  and (config->'github' is null);

-- ============================================================================
-- Índice para lookups por feature
-- ============================================================================
create index if not exists idx_clients_config_language on clients ((config->>'language')) where slug <> 'fba-academy';

-- ============================================================================
-- Vista de conveniencia para el panel de admin
-- ============================================================================
create or replace view client_config_summary as
select
  id,
  slug,
  name,
  active,
  client_type,
  config->>'language' as language,
  config->'features' as features,
  config->'branding' as branding,
  config->'github' as github,
  config->'integrations' as integrations,
  (config->>'locked')::boolean as locked,
  created_at
from clients
where slug <> 'fba-academy';

comment on column clients.config is 'Config self-service del cliente: language, features, branding, github, integrations, labels. fba-academy NO usa esta columna (queda NULL/{}).';
comment on view client_config_summary is 'Vista agregada del config por cliente para panel admin. Excluye fba-academy.';
