-- HELM — qué avisos se han mandado ya, y a quién.
--
-- Sin esto, la lista de "hoy toca avisar" volvería a proponer al mismo cliente
-- cada vez que alguien abre la pantalla, y acabaría recibiendo cuatro mensajes
-- el mismo día. Un aviso repetido molesta más que uno que falta.
create table if not exists helm_fiscal_avisos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  obligacion_id uuid not null references helm_fiscal_obligaciones(id) on delete cascade,
  -- Qué aviso es. Los tres de vencimiento (7 días, 3 días y el día D) y los
  -- cuatro de recogida de documentación del trimestre que pidió Alejandro.
  tipo          text not null
                check (tipo in ('d7', 'd3', 'd0', 'trim1', 'trim7', 'trim14', 'trim18')),
  canal         text not null default 'whatsapp'
                check (canal in ('whatsapp', 'email', 'manual')),
  enviado_at    timestamptz not null default now(),
  enviado_por   text not null default '',

  -- Cada aviso, una vez. Es lo que hace que la lista no se repita.
  unique (obligacion_id, tipo)
);
create index if not exists helm_fiscal_avisos_client_idx on helm_fiscal_avisos (client_id, enviado_at desc);

alter table helm_fiscal_avisos enable row level security;
drop policy if exists helm_fiscal_avisos_all on helm_fiscal_avisos;
create policy helm_fiscal_avisos_all on helm_fiscal_avisos for all using (true) with check (true);
