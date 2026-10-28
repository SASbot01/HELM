-- HELM — Formación en tres niveles: curso → módulo → clase.
--
-- Hasta aquí la formación tenía dos niveles (helm_courses → helm_lessons) y un
-- curso largo se quedaba en una lista de veinte clases seguidas, sin forma de
-- agruparlas ni de ordenarlas.
--
-- El módulo es OPCIONAL a propósito: `helm_lessons.module_id` admite null y esa
-- clase cuelga directamente del curso. Así los cursos que ya existían siguen
-- funcionando igual sin tocar una sola fila, y quien no quiera módulos no los
-- ve nunca.

create extension if not exists "pgcrypto";

create table if not exists helm_modules (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  course_id   uuid not null references helm_courses(id) on delete cascade,
  title       text not null,
  description text not null default '',
  position    integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helm_modules_course_idx on helm_modules (course_id, position);
create index if not exists helm_modules_client_idx on helm_modules (client_id);

-- on delete cascade: borrar un módulo se lleva sus clases, igual que borrar un
-- curso se lleva sus módulos. Es lo que espera quien pulsa la papelera.
alter table helm_lessons
  add column if not exists module_id uuid references helm_modules(id) on delete cascade;
create index if not exists helm_lessons_module_idx on helm_lessons (module_id, position);

-- ── Orden ──────────────────────────────────────────────────────────────────
-- Todo lo creado antes de esto se guardó con position 0. Con empates, mover
-- una fila no cambia nada: el orden lo acababa decidiendo created_at. Se
-- numeran de una vez, por curso, y a partir de ahí las flechas del panel ya
-- tienen sobre qué trabajar.
with orden as (
  select id, row_number() over (partition by client_id order by position, created_at) - 1 as n
  from helm_courses
)
update helm_courses c set position = orden.n from orden
where orden.id = c.id and c.position is distinct from orden.n;

with orden as (
  select id,
         row_number() over (partition by course_id, module_id order by position, created_at) - 1 as n
  from helm_lessons
)
update helm_lessons l set position = orden.n from orden
where orden.id = l.id and l.position is distinct from orden.n;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mismo patrón que helm_courses/helm_lessons: allow-all, el acceso lo controla
-- la app, que entra con la anon key.
alter table helm_modules enable row level security;
drop policy if exists helm_modules_all on helm_modules;
create policy helm_modules_all on helm_modules for all using (true) with check (true);
