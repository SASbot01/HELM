-- HELM — Tareas entre perfiles y tareas privadas de un miembro.
--
-- Hasta ahora una tarea vivía dentro de un perfil y la veía todo el que entraba
-- a ese perfil. Faltaban dos cosas que se piden a diario:
--
--   1) Encargar trabajo a OTRO negocio que también usa HELM. Dos empresas que
--      colaboran (una agencia y su editor, un despacho y su gestoría) se
--      mandaban las tareas por WhatsApp y se perdían. Aquí se hacen visibles en
--      el tablero de los dos, sin que ninguno tenga que entrar en el panel del
--      otro.
--
--      No basta con dejar escribir en el perfil ajeno: eso sería que cualquiera
--      pudiera llenarle el tablero a quien quisiera. Por eso hay una solicitud
--      de colaboración que la otra parte acepta — y mientras no la acepte, no
--      se le puede encargar nada.
--
--   2) Tareas privadas de un miembro. Una conversación pendiente sobre el sueldo
--      de alguien, o el aviso de que hay que renovarle el contrato, no puede
--      salir en el tablero que ve el resto del equipo.
--
-- Idempotente.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) COLABORACIÓN ENTRE PERFILES
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists helm_collaborations (
  id             uuid primary key default gen_random_uuid(),
  -- Quién la pide y a quién. La dirección solo importa para saber quién tiene
  -- que responder: una vez aceptada, la colaboración va en los dos sentidos.
  from_client_id uuid not null references clients(id) on delete cascade,
  to_client_id   uuid not null references clients(id) on delete cascade,
  status         text not null default 'pendiente'
                   check (status in ('pendiente', 'aceptada', 'rechazada')),
  message        text not null default '',   -- para qué quieren colaborar
  requested_by   text not null default '',   -- email de quien la manda
  responded_by   text not null default '',   -- email de quien contesta
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  constraint helm_collaborations_distintos check (from_client_id <> to_client_id)
);

-- Una sola colaboración viva por pareja, la pida quien la pida: sin esto, A→B
-- y B→A serían dos filas y el tablero no sabría cuál mirar. `least/greatest`
-- normaliza la pareja para que el orden no cuente.
--
-- Las rechazadas quedan fuera del índice a propósito: un "ahora no" no puede
-- ser un "nunca más". Se guarda la fila (para no perder el histórico) y se
-- puede volver a pedir más adelante.
create unique index if not exists helm_collaborations_pareja_idx
  on helm_collaborations (least(from_client_id, to_client_id), greatest(from_client_id, to_client_id))
  where status in ('pendiente', 'aceptada');

create index if not exists helm_collaborations_from_idx on helm_collaborations (from_client_id, status);
create index if not exists helm_collaborations_to_idx   on helm_collaborations (to_client_id, status);

comment on table helm_collaborations is
  'Acuerdo entre dos perfiles de HELM para poder encargarse tareas. Mientras no '
  'esté "aceptada", ninguno de los dos puede escribir en el tablero del otro.';

alter table helm_collaborations enable row level security;
do $$
begin
  drop policy if exists helm_collaborations_all on helm_collaborations;
  create policy helm_collaborations_all on helm_collaborations for all using (true) with check (true);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) LA TAREA SABE QUIÉN LA ENCARGÓ
-- ═══════════════════════════════════════════════════════════════════════════
-- La tarea sigue viviendo en el perfil que tiene que HACERLA (`client_id`): así
-- sale en su tablero, en su calendario y en sus filtros sin tocar nada. Lo que
-- se añade es de dónde vino, que es lo que permite pintarla como encargo
-- externo y que el que la encargó pueda seguirla desde su propio panel.
--
-- Null = tarea de casa, que es el 99% y el comportamiento de siempre.
alter table crm_tasks
  add column if not exists origin_client_id uuid references clients(id) on delete set null;

create index if not exists crm_tasks_origin_idx on crm_tasks (origin_client_id)
  where origin_client_id is not null;

comment on column crm_tasks.origin_client_id is
  'Perfil que ENCARGÓ la tarea, cuando viene de una colaboración. Null = la '
  'tarea es del propio perfil. El responsable de hacerla sigue siendo client_id.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) TAREAS PRIVADAS
-- ═══════════════════════════════════════════════════════════════════════════
-- 'equipo'  → la ve todo el que entra al perfil. Es el valor de siempre.
-- 'privada' → solo su responsable y quien manda en el perfil.
--
-- Se guarda como texto y no como booleano `es_privada` porque esto va a crecer:
-- el siguiente escalón previsible es "solo los de mi rol", y con un booleano
-- habría que migrar la columna entera.
alter table crm_tasks
  add column if not exists visibility text not null default 'equipo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_tasks_visibility_check'
  ) then
    alter table crm_tasks add constraint crm_tasks_visibility_check
      check (visibility in ('equipo', 'privada'));
  end if;
end $$;

comment on column crm_tasks.visibility is
  'Quién ve la tarea en el tablero. equipo = todos los del perfil; privada = '
  'solo el responsable (assignee_helm_id) y quien tiene acceso total.';

-- Una tarea privada sin responsable no la vería nadie salvo los admins, que es
-- justo lo contrario de lo que se busca al marcarla. No se bloquea en la base
-- (la app lo exige al guardar) pero se deja constancia de cuántas hay.
do $$
declare v_huerfanas int;
begin
  select count(*) into v_huerfanas
    from crm_tasks
   where visibility = 'privada' and assignee_helm_id is null;
  if v_huerfanas > 0 then
    raise notice '[HELM] % tareas privadas sin responsable: solo las verán los admins', v_huerfanas;
  end if;
end $$;
