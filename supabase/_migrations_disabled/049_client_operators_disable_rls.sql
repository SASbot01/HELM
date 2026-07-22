-- 049 · Deshabilitar RLS en client_operators
-- Las tablas operativas del proyecto (stores, crm_pipelines, team, etc.) leen sin
-- RLS desde el cliente con la anon key. La tabla `client_operators` se creó con
-- RLS habilitado por default (Supabase activa RLS en tablas nuevas), lo que hace
-- que la SPA reciba [] en vez de las filas reales.
-- Idempotente.

ALTER TABLE client_operators DISABLE ROW LEVEL SECURITY;
