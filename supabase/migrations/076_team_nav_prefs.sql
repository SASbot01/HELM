-- 076_team_nav_prefs.sql
-- Per-user nav menu customization.
--
-- Cada miembro del team puede ocultar sub-items del sidebar que no usa,
-- desde MyProfilePage → "Mi Menú". El formato del JSONB:
--
--   { "hidden": ["/lead-magnet", "/marketing/webs", "/ai-agents/brain"] }
--
-- Default '{}'::jsonb (objeto vacío) = todo visible para usuarios existentes.
-- AlexNav lee `userMember.nav_prefs.hidden` y filtra los sub-items cuyo
-- `path` esté en ese array. Si un módulo se queda sin sub-items visibles,
-- el módulo entero se oculta automáticamente (lógica ya existente en
-- filterModulesByFeatures).
--
-- Esto NO afecta a items "esenciales" del config (Mi Perfil, Mis
-- Integraciones, Settings) — la UI de customización los excluye del
-- listado y por tanto nunca aparecen en `hidden`.

ALTER TABLE team
  ADD COLUMN IF NOT EXISTS nav_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN team.nav_prefs IS
  'Per-user nav customization. Format: {"hidden": ["/path1", "/path2"]}. Set from MyProfilePage → Mi Menú.';
