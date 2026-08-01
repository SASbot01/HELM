-- HELM — Archivos: el cajón de documentos del perfil.
--
-- Hasta ahora los archivos vivían pegados a la cosa que los usaba: adjuntos de
-- una pieza de contenido, de una lección, de una tarea. Eso está bien para
-- ellos, pero deja fuera lo que no es de nadie en concreto: el guion que le
-- pediste al chat, la Biblia que salió del onboarding, el contrato que subes
-- porque sí. Esta sección es ese sitio.
--
-- El fichero en sí sigue en el bucket `helm` de Storage (el mismo que usa
-- Adjuntos); aquí solo vive la ficha, que es lo que permite buscarlo, saber de
-- dónde salió y agruparlo por carpeta.
--
-- Idempotente: se puede aplicar más de una vez sin riesgo.

create table if not exists helm_files (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  -- `path` es la ruta dentro del bucket. Vacía solo si algún día se guarda algo
  -- que no llegue a ser un fichero; hoy siempre tiene valor.
  path        text not null default '',
  url         text not null default '',
  type        text not null default '',
  size        bigint not null default 0,
  folder      text not null default 'General',
  -- De dónde salió. Es lo que permite filtrar "enséñame solo lo que ha
  -- generado la IA" sin tener que mirar el nombre del archivo.
  source      text not null default 'manual',   -- manual | chat | onboarding
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists helm_files_client_idx on helm_files (client_id, created_at desc);
create index if not exists helm_files_source_idx on helm_files (client_id, source);

alter table helm_files enable row level security;
drop policy if exists helm_files_all on helm_files;
create policy helm_files_all on helm_files for all using (true) with check (true);
