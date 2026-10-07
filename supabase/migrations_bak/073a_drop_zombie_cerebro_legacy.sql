-- 073_drop_zombie_cerebro_legacy.sql
--
-- Sprint Arreglos [db] · Drop tablas zombie del sistema cerebro/agent legacy.
-- Reemplazadas por `brain_decisions` (2056 rows vivas a 2026-05-09).
--
-- Auditadas con criterio:
--   1. n_live_tup = 0  (sin filas vivas)
--   2. n_tup_ins = 0   (nunca se ha insertado nada)
--   3. 0 referencias en código (Dashboard-Ops/src/, Dashboard-Ops/api/, enjambre-api/src/)
--   4. 0 referencias en migrations previas (no rompe rollback path)
--
-- Backup schema completo en doc:
--   alex2.0/03-Tecnologia/DB-Tablas-Zombie-2026-05-08.md sección "Cerebro legacy"
--
-- ROLLBACK:
--   Re-crear las 6 tablas con los CREATE TABLE statements del backup
--   (no incluyo aquí porque son tablas zombie sin uso real).

DROP TABLE IF EXISTS public.agent_evolution_snapshots;
DROP TABLE IF EXISTS public.agent_performance_metrics;
DROP TABLE IF EXISTS public.autonomous_agent_runs;
DROP TABLE IF EXISTS public.cerebro_actions;
DROP TABLE IF EXISTS public.cerebro_events;
DROP TABLE IF EXISTS public.cerebro_learnings;
