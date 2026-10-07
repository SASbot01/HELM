-- 019_sequence_retries.sql
-- Añade soporte de retry para sequence_enrollments. Aditiva.

alter table if exists sequence_enrollments
  add column if not exists retry_count int not null default 0,
  add column if not exists last_error text,
  add column if not exists failed_at timestamptz;

-- Marca enrollments antiguos atascados en error como 'failed' para no reintentar indefinidamente
update sequence_enrollments set status = 'failed', failed_at = now()
where status = 'error' and (failed_at is null);

create index if not exists idx_seq_enrollments_due
  on sequence_enrollments(next_fire_at)
  where status = 'active';
