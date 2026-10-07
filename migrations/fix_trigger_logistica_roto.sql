-- HELM — quitar el trigger que impedía actualizar contactos del CRM.
--
-- ── El fallo ───────────────────────────────────────────────────────────────
-- `crm_contacts` arrastraba un trigger de la plataforma de logística antigua:
--
--     trg_auto_logistics_order  →  auto_create_logistics_order()
--
-- Su primera línea es `IF NEW.stage = 'cerrado_ganado'`, pero en esta tabla esa
-- columna NUNCA ha existido: la etapa se guarda en `status` (y en `stage_key`).
-- Postgres no valida los campos de un plpgsql hasta que se ejecuta, así que el
-- trigger se creó sin protestar y solo revienta al usarse.
--
-- Consecuencia: TODA actualización de un contacto fallaba con
--     42703: record "new" has no field "stage"
-- Es decir, el CRM era de solo lectura sin que nada lo dijera:
--   · mover una tarjeta de etapa no se guardaba
--   · editar la ficha de un contacto no se guardaba
--   · Stripe y WooCommerce no podían marcar al comprador como ganado
--   · last_activity_at nunca se actualizaba
--
-- El código que llamaba sin comprobar el error se lo tragaba en silencio, que
-- es lo que hacía tan difícil de ver el problema.
--
-- ── La corrección ──────────────────────────────────────────────────────────
-- Se desengancha el trigger. La función se deja en la base (por si algo del
-- histórico la referencia) pero anotada, para que quien la encuentre sepa que
-- está rota y no la vuelva a enganchar tal cual.
--
-- Aplicar en Supabase → SQL Editor.

begin;

drop trigger if exists trg_auto_logistics_order on public.crm_contacts;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'auto_create_logistics_order') then
    comment on function public.auto_create_logistics_order() is
      'ROTA — de la plataforma de logística retirada. Referencia NEW.stage, que no '
      'existe en crm_contacts (la etapa vive en status). Su trigger se retiró el '
      '2026-07-25 porque hacía fallar toda actualización de contactos con el error '
      '42703. No volver a engancharla sin cambiar NEW.stage por NEW.status.';
  end if;
end $$;

commit;
