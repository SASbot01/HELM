-- 065_rename_ic_to_yc_logistics_web.sql
-- Renombra el pipeline 'IC Logistics Web' → 'YC Logistics Web' para alinear
-- el nombre visible con el slug DB del cliente ('yc-logistics' — typo histórico
-- pero ya consolidado). El endpoint /api/forms/icl-submit pasa a buscar el
-- pipeline por el nombre nuevo, así que esta migración debe correr antes de
-- desplegar el cambio del endpoint.
--
-- Idempotente: si el pipeline ya tiene el nombre nuevo (entorno fresh tras
-- 064 actualizado), no hace nada. Si por alguna razón existen ambos, deja el
-- 'YC Logistics Web' y elimina el 'IC Logistics Web' vacío (sin contactos).

do $$
declare
  v_client_id uuid;
  v_old_id uuid;
  v_new_id uuid;
  v_old_count int;
begin
  select id into v_client_id from clients where slug = 'yc-logistics' limit 1;
  if v_client_id is null then
    raise notice 'Cliente yc-logistics no existe — saltando rename';
    return;
  end if;

  select id into v_old_id from crm_pipelines
    where client_id = v_client_id and name = 'IC Logistics Web' limit 1;
  select id into v_new_id from crm_pipelines
    where client_id = v_client_id and name = 'YC Logistics Web' limit 1;

  if v_old_id is null and v_new_id is not null then
    raise notice 'Pipeline ya está como YC Logistics Web — nada que hacer';
    return;
  end if;

  if v_old_id is not null and v_new_id is null then
    update crm_pipelines set name = 'YC Logistics Web' where id = v_old_id;
    raise notice 'Pipeline renombrado: IC Logistics Web → YC Logistics Web';
    return;
  end if;

  if v_old_id is not null and v_new_id is not null then
    -- Coexisten ambos. Migramos contactos del viejo al nuevo y borramos el viejo.
    update crm_contacts set pipeline_id = v_new_id where pipeline_id = v_old_id;
    select count(*) into v_old_count from crm_contacts where pipeline_id = v_old_id;
    if v_old_count = 0 then
      delete from crm_pipelines where id = v_old_id;
      raise notice 'Pipeline IC Logistics Web eliminado tras migrar contactos a YC Logistics Web';
    else
      raise notice 'Pipeline IC Logistics Web aún tiene contactos — no se elimina';
    end if;
    return;
  end if;

  raise notice 'No existe pipeline IC/YC Logistics Web — la migración 064 debería crearlo';
end $$;
