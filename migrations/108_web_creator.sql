-- 108 — Web Creator: cuando un contacto del CRM pasa a «En fabricación», HELM
-- reúne todo lo que sabe de él, estudia las webs mejor posicionadas de su
-- sector y deja preparado el prompt para construir su web (api/_lib/webcreator.js,
-- api/web-creator.js, Agentes → Web Creator).
--
--   · helm_web_creator     → qué perfiles tienen el agente y qué etapa lo dispara.
--   · helm_web_fabricacion → una ficha por contacto en fabricación: los datos,
--                            el estudio, el prompt y dónde quedó publicada.
--
-- Por ahora solo para el perfil web-seller, al que además se le añade la etapa
-- «En fabricación» en sus pipelines.
--
-- Solo el servidor las toca: RLS activado sin políticas y fuera de la puerta
-- del panel (SECRETAS en api/_lib/pasarela.js). Idempotente.

begin;

create table if not exists helm_web_creator (
  client_id uuid primary key references clients(id) on delete cascade,
  activo boolean not null default true,
  -- La clave de etapa que lanza el estudio (la misma en todos los pipelines).
  etapa_key text not null default 'en_fabricacion',
  created_at timestamptz not null default now()
);

create table if not exists helm_web_fabricacion (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  -- 'pendiente' → 'estudiando' → 'listo' | 'error'
  estado text not null default 'pendiente' check (estado in ('pendiente', 'estudiando', 'listo', 'error')),
  -- En qué punto está la web: por construir, en construcción, publicada, entregada.
  fase text not null default 'por_construir' check (fase in ('por_construir', 'construyendo', 'publicada', 'entregada')),
  sector text,
  ciudad text,
  datos jsonb not null default '{}'::jsonb,
  estudio jsonb not null default '{}'::jsonb,
  prompt text,
  prompt_con_ia boolean not null default false,
  error text,
  repo_url text,
  web_url text,
  notas text,
  estudiado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, contact_id)
);
create index if not exists helm_web_fabricacion_perfil on helm_web_fabricacion (client_id, created_at desc);

alter table helm_web_creator enable row level security;
alter table helm_web_fabricacion enable row level security;
revoke all on helm_web_creator from anon, authenticated;
revoke all on helm_web_fabricacion from anon, authenticated;

-- El perfil web-seller tiene el agente.
insert into helm_web_creator (client_id)
select id from clients where slug = 'web-seller'
on conflict (client_id) do nothing;

-- Y la etapa «En fabricación» en cada uno de sus pipelines, si no la tiene:
-- antes de «Ganado», o antes de «entregado» en el de Lorca; si no hay
-- ninguna de las dos, al final.
do $$
declare
  p record;
  pos int;
begin
  for p in
    select cp.id, cp.stages from crm_pipelines cp
    join clients c on c.id = cp.client_id
    where c.slug = 'web-seller'
      and not exists (select 1 from jsonb_array_elements(cp.stages) s where s->>'key' = 'en_fabricacion')
  loop
    select min(e.i - 1) into pos
    from jsonb_array_elements(p.stages) with ordinality as e(s, i)
    where e.s->>'key' = 'ganado' or lower(trim(e.s->>'label')) = 'entregado';
    if pos is null then
      update crm_pipelines set stages = stages || '[{"key": "en_fabricacion", "tone": "", "label": "En fabricación"}]'::jsonb where id = p.id;
    else
      update crm_pipelines
      set stages = jsonb_insert(stages, array[pos::text], '{"key": "en_fabricacion", "tone": "", "label": "En fabricación"}'::jsonb)
      where id = p.id;
    end if;
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';
