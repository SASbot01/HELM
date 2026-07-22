-- 064_ic_logistics_web_pipeline.sql
-- Pipeline "IC Logistics Web" para el cliente yc-logistics (IC Logistics).
-- Recibe leads del form de https://landing-bootcamp-fba.vercel.app via
-- /api/forms/icl-submit (clase de patrón dcc-submit).
--
-- Cliente: slug = 'yc-logistics' (id 1fbc0188-0c21-42e1-b463-ef2493ed438f).
--
-- Stages del pipeline (flujo CRM clásico):
--   lead_nuevo         → entrada desde el form (nuevo registro)
--   contactado         → primer contacto (WhatsApp / email)
--   agendado           → llamada / reunión agendada
--   reunion_realizada  → tuvo lugar la reunión
--   propuesta_enviada  → propuesta enviada al cliente
--   ganado             → cerrado con éxito
--   perdido            → no convierte
--
-- crm_contacts.custom_fields para leads de IC Logistics Web contendrá:
--   {
--     "source_form": "iclogistics-bootcamp",
--     "landing_url": "https://landing-bootcamp-fba.vercel.app/",
--     "submitted_at": "<iso>",
--     "instagram":   "@usuario" | null,
--     "presupuesto_estimado": "3,500 a 5,500"  -- reservado, se rellena cuando exista la calculadora
--   }

do $$
declare
  v_client_id uuid;
begin
  select id into v_client_id from clients where slug = 'yc-logistics' limit 1;
  if v_client_id is null then
    raise notice 'Cliente yc-logistics no existe — saltando pipeline creation';
    return;
  end if;

  if exists (select 1 from crm_pipelines where client_id = v_client_id and name = 'IC Logistics Web') then
    update crm_pipelines
    set stages = '[
      {"key": "lead_nuevo",        "label": "Lead nuevo",        "color": "#6366F1"},
      {"key": "contactado",        "label": "Contactado",        "color": "#F59E0B"},
      {"key": "agendado",          "label": "Agendado",          "color": "#3B82F6"},
      {"key": "reunion_realizada", "label": "Reunión realizada", "color": "#8B5CF6"},
      {"key": "propuesta_enviada", "label": "Propuesta enviada", "color": "#EC4899"},
      {"key": "ganado",            "label": "Ganado",            "color": "#10B981"},
      {"key": "perdido",           "label": "Perdido",           "color": "#EF4444"}
    ]'::jsonb
    where client_id = v_client_id and name = 'IC Logistics Web';
    raise notice 'Pipeline IC Logistics Web actualizado';
  else
    insert into crm_pipelines (client_id, name, stages, is_default)
    values (
      v_client_id,
      'IC Logistics Web',
      '[
        {"key": "lead_nuevo",        "label": "Lead nuevo",        "color": "#6366F1"},
        {"key": "contactado",        "label": "Contactado",        "color": "#F59E0B"},
        {"key": "agendado",          "label": "Agendado",          "color": "#3B82F6"},
        {"key": "reunion_realizada", "label": "Reunión realizada", "color": "#8B5CF6"},
        {"key": "propuesta_enviada", "label": "Propuesta enviada", "color": "#EC4899"},
        {"key": "ganado",            "label": "Ganado",            "color": "#10B981"},
        {"key": "perdido",           "label": "Perdido",           "color": "#EF4444"}
      ]'::jsonb,
      true
    );
    raise notice 'Pipeline IC Logistics Web creado';
  end if;
end $$;
