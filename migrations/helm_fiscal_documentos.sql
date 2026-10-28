-- HELM — los documentos que el cliente de una asesoría sube por su portal.
--
-- El dolor que resuelve: 60-100 h/mes persiguiendo facturas por WhatsApp, email
-- y teléfono. El cliente entra por su enlace, sube lo suyo, y la obligación deja
-- de estar "pendiente de docs" sola.
--
-- El fichero vive en el bucket `helm` bajo fiscal/<cliente>/<contacto>/; aquí
-- solo está el registro, que es lo que se puede buscar, filtrar y vincular.
create table if not exists helm_fiscal_documentos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  contact_id    uuid not null references crm_contacts(id) on delete cascade,
  -- A qué vencimiento corresponde. Admite null: hay documentos que el cliente
  -- manda sin que toque nada todavía (un contrato nuevo, una nómina suelta), y
  -- perderlos por no tener dónde colgarlos sería absurdo.
  obligacion_id uuid references helm_fiscal_obligaciones(id) on delete set null,

  nombre        text not null,
  ruta          text not null,          -- ruta dentro del bucket `helm`
  tipo          text not null default 'otro'
                check (tipo in ('factura_emitida', 'factura_recibida', 'extracto',
                                'nomina', 'contrato', 'otro')),
  origen        text not null default 'portal',   -- portal | panel | email
  subido_at     timestamptz not null default now()
);
create index if not exists helm_fiscal_doc_contacto_idx on helm_fiscal_documentos (contact_id, subido_at desc);
create index if not exists helm_fiscal_doc_oblig_idx    on helm_fiscal_documentos (obligacion_id);

alter table helm_fiscal_documentos enable row level security;
drop policy if exists helm_fiscal_documentos_all on helm_fiscal_documentos;
create policy helm_fiscal_documentos_all on helm_fiscal_documentos for all using (true) with check (true);
