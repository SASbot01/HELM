-- 053 · Catálogo: añadir Anthropic (Claude) como servicio per-tenant
--
-- Permite que cada tenant introduzca su propia API key de Anthropic desde
-- /MyIntegrations y que los flujos de IA "billed-to-tenant" (pre-form scoring,
-- evaluación de respuestas open-text, asistentes del propio cliente) usen esa
-- clave en vez de la global ANTHROPIC_API_KEY del SaaS.
--
-- Idempotente: ON CONFLICT (key) DO UPDATE.
-- ROLLBACK: DELETE FROM integration_services WHERE key = 'anthropic';

insert into integration_services (key, name, category, icon, color, auth_type, description, fields, sort_order) values
  ('anthropic', 'Anthropic (Claude)', 'ai', '🤖', '#D97757', 'apikey',
   'Tu API key de Anthropic Claude. Usada por features de IA del tenant (pre-form scoring, evaluación de respuestas, asistentes propios). Si no configuras key, los flujos de IA del cliente quedan deshabilitados.',
   jsonb_build_array(
     jsonb_build_object('key','apiKey','label','API key','type','password','required',true,'placeholder','sk-ant-...'),
     jsonb_build_object('key','model','label','Modelo por defecto','type','text','required',false,'placeholder','claude-haiku-4-5-20251001')
   ), 80)
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  icon = excluded.icon,
  color = excluded.color,
  auth_type = excluded.auth_type,
  description = excluded.description,
  fields = excluded.fields,
  sort_order = excluded.sort_order;
