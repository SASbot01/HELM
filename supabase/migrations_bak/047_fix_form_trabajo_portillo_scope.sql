-- 047 · Fix anomalía: FormTrabajoPortillo quedó con owner_scope=NULL después
-- del seed de la migration 043. Lo corregimos antes del backfill operator_id
-- para que el FK quede consistente.
-- Idempotente.

UPDATE crm_pipelines
SET owner_scope = 'portillo'
WHERE client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
  AND name = 'FormTrabajoPortillo'
  AND owner_scope IS NULL;
