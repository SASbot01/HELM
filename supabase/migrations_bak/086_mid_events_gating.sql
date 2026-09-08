-- 086_mid_events_gating.sql
-- Gating de eventos del calendario por training_route.
--
-- Antes: todos los miembros logueados veían todos los mid_events del tenant.
-- Ahora: si gated_route_id está seteado, solo los users con suscripción a
-- esa route lo ven. Admins siempre ven todos.
--
-- Caso de uso: directos exclusivos para alumnos del programa de pago,
-- charlas Q&A solo para Primeros Pasos, etc. Si gated_route_id es NULL,
-- el evento es público para cualquier miembro (comportamiento legacy).

ALTER TABLE mid_events
  ADD COLUMN IF NOT EXISTS gated_route_id UUID
    REFERENCES training_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mid_events_gated_route_idx
  ON mid_events (gated_route_id);

COMMENT ON COLUMN mid_events.gated_route_id IS
  'Si NOT NULL, el evento solo es visible para users con subscription a esta training_route. NULL = abierto a todos los miembros del tenant. Admins siempre ven todo.';
