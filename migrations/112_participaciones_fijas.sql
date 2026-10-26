-- HELM — Participaciones: ventas que no cuentan y cantidades fijas al mes
-- (sigue a 111_participaciones.sql).
--
-- · excluidas: ventas del origen que no llevan parte. Las mensualidades de
--   David Villasmil y Alexander Salgado van enteras a Detrás de Cámara (Alex,
--   26-oct-2026); las que entren más adelante sí cuentan, salvo que se añadan.
-- · importe_mensual + desde: una cantidad fija al mes en vez de un porcentaje.
--   De En Forma con Hugo, Silvestre AI se lleva 200 € al mes desde octubre de
--   2026: un ingreso por mes, del mes de «desde» al actual.
--
-- Idempotente: relanzarla no pisa lo cambiado a mano.

begin;

alter table helm_participaciones add column if not exists excluidas uuid[] not null default '{}';
alter table helm_participaciones add column if not exists importe_mensual numeric(10,2);
alter table helm_participaciones add column if not exists desde date;
alter table helm_participaciones alter column porcentaje drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'helm_participaciones_importe_ok') then
    alter table helm_participaciones add constraint helm_participaciones_importe_ok
      check (importe_mensual is null or (importe_mensual > 0 and desde is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'helm_participaciones_una_forma') then
    alter table helm_participaciones add constraint helm_participaciones_una_forma
      check ((porcentaje is null) <> (importe_mensual is null));
  end if;
end $$;

-- Las mensualidades de David y Alexander, fuera del 35 % de Detrás de Cámara.
update helm_participaciones p
set excluidas = (select array_agg(distinct x) from unnest(p.excluidas || array[
  '9401b5fc-9895-4403-a3d6-d88e39683851'::uuid,   -- David Villasmil · mensualidad
  '910c17b2-e256-442b-8119-ea484fccb421'::uuid    -- Alexander Salgado · mensualidad
]) as x)
from clients b, clients o
where p.client_id = b.id and b.slug = 'silvestre' and p.origen_id = o.id and o.slug = 'detras-de-camra';

-- 200 € al mes de En Forma con Hugo, desde octubre de 2026.
insert into helm_participaciones (client_id, origen_id, importe_mensual, desde, nota)
select b.id, o.id, 200.00, date '2026-10-01', '200 € al mes de En Forma con Hugo'
from clients b, clients o
where b.slug = 'silvestre' and o.slug = 'enformaconhugo'
on conflict (client_id, origen_id) do nothing;

commit;
