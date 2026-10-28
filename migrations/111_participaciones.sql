-- HELM — Participaciones: la parte de lo que cobra un perfil que es de otro.
--
-- Alex se lleva el 35 % de lo que pagan los clientes de Detrás de Cámara y el
-- 50 % de lo que vende web-seller. El Informe de Silvestre AI (quien cobra la
-- parte) suma esas ventas multiplicadas por el porcentaje, cliente a cliente y
-- cada cobro en su mes, sin copiar filas: lo calcula api/participaciones.js a
-- partir de las ventas reales del perfil de origen.
--
-- Solo el servidor la toca (SECRETAS en api/_lib/pasarela.js). Idempotente:
-- relanzarla no pisa un porcentaje cambiado ni reactiva una desactivada.
--
-- Además: la etapa «Pidió acceso» en el embudo School de silvestre, donde
-- entran las solicitudes de acceso a AI para todo (api/leads.js) hasta que se
-- aprueban («Acceso dado», api/accesos.js).

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
on conflict (client_id, origen_id) do nothing;

alter table helm_participaciones enable row level security;
revoke all on helm_participaciones from anon, authenticated;

-- «Pidió acceso», justo antes de «Acceso dado».
update crm_pipelines p
set stages = (
  select jsonb_agg(e order by o)
  from (
    select e, i * 10 as o
    from jsonb_array_elements(p.stages) with ordinality as t(e, i)
    union all
    select jsonb_build_object('key', 'pidio_acceso', 'color', '#F59E0B', 'label', 'Pidió acceso',
      'description', 'Pidió acceso a AI para todo con su nombre y su correo. Se aprueba en Perfiles → Accesos cuando está en el Skool.'),
      (select i * 10 - 5 from jsonb_array_elements(p.stages) with ordinality as t(e, i) where e->>'key' = 'acceso_dado')
  ) x
)
from clients c
where p.client_id = c.id and c.slug = 'silvestre' and p.name = 'School'
  and jsonb_typeof(p.stages) = 'array'
  and exists (select 1 from jsonb_array_elements(p.stages) e where e->>'key' = 'acceso_dado')
  and not exists (select 1 from jsonb_array_elements(p.stages) e where e->>'key' = 'pidio_acceso');

commit;
