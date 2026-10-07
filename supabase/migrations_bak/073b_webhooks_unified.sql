-- 073 · webhook_events + webhook_dlq — soporte para webhookHandler unificado
--
-- Cierra la task "[integraciones] webhookHandler unificado (signature + idempotency + DLQ)"
-- del Sprint Arreglos.
--
-- webhook_events: idempotency. Cada (provider, event_id) único — si llega
-- dos veces el mismo evento (Stripe re-tries, Meta re-envíos), el segundo
-- INSERT choca con duplicate key y el handler skip.
--
-- webhook_dlq: dead letter queue. Si el handler tira excepción, guardamos
-- el evento crudo para retry manual o automático desde admin UI.
--
-- Idempotente.
-- ROLLBACK:
--   DROP TABLE IF EXISTS webhook_dlq;
--   DROP TABLE IF EXISTS webhook_events;

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  payload_summary jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_time
  ON webhook_events(provider, processed_at DESC);

COMMENT ON TABLE webhook_events IS
  'Idempotency log para webhooks. Cada (provider, event_id) único. Permite descartar re-envíos del mismo evento.';

CREATE TABLE IF NOT EXISTS webhook_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text,
  raw_body text,
  error_message text NOT NULL,
  headers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  retried_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by text,
  resolved_at timestamptz,
  resolved_notes text
);

CREATE INDEX IF NOT EXISTS idx_webhook_dlq_pending
  ON webhook_dlq(created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_provider
  ON webhook_dlq(provider, created_at DESC);

COMMENT ON TABLE webhook_dlq IS
  'Dead letter queue: webhooks que fallaron al procesarse. Se retienen para retry manual o automático. Marcar resolved=true cuando se resuelve manualmente.';

-- Auto-cleanup: webhook_events más de 90 días se pueden borrar (idempotency
-- útil hasta que el provider deja de retransmitir). Usar un cron separado
-- o ejecutar manualmente:
--   DELETE FROM webhook_events WHERE processed_at < now() - interval '90 days';
