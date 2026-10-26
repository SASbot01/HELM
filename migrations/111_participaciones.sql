-- HELM — Participaciones: la parte de lo que cobra un perfil que es de otro.
--
-- Alex se lleva el 35 % de lo que pagan los clientes de Detrás de Cámara y el
-- 50 % de lo que vende web-seller. El Informe de Silvestre AI (quien cobra la
-- parte) suma esas ventas multiplicadas por el porcentaje, cliente a cliente y
-- cada cobro en su mes, sin copiar filas: lo calcula api/participaciones.js a
-- partir de las ventas reales del perfil de origen.
--
-- Solo el servidor la toca (SECRETAS en api/_lib/pasarela.js). Idempotente.

begin;

create table if not exists helm_participaciones (
  id uuid primary key default gen_random_uuid(),
  -- Quien se lleva la parte y de qué perfil sale.
  client_id uuid not null references clients(id) on delete cascade,
  origen_id uuid not null references clients(id) on delete cascade,
  porcentaje numeric(5,2) not null check (porcentaje > 0 and porcentaje <= 100),
  activa boolean not null default true,
  nota text not null default '',
  created_at timestamptz not null default now(),
  unique (client_id, origen_id),
  check (client_id <> origen_id)
);

insert into helm_participaciones (client_id, origen_id, porcentaje, nota)
select b.id, o.id, x.pct, x.nota
from (values
  ('silvestre', 'detras-de-camra', 35.00, '35 % de lo que pagan los clientes de Detrás de Cámara'),
  ('silvestre', 'web-seller', 50.00, '50 % de lo que vende web-seller')
) as x(beneficiario, origen, pct, nota)
join clients b on b.slug = x.beneficiario
join clients o on o.slug = x.origen
on conflict (client_id, origen_id) do update set porcentaje = excluded.porcentaje, nota = excluded.nota, activa = true;

commit;
