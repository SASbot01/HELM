-- 043 · owner_scope (seed + idempotent columns)
-- Context: Dashboard-Ops multi-tenant, client_id 811278fd-892f-4709-8ae6-2d7faa67bd1c (asesorias-suiza)
-- Objetivo: que Lukas sólo vea pipelines/contactos suyos y Portillo sólo los suyos.
-- `alejandro@blackwolfsec.io` y otros CEOs quedan con owner_scope=NULL (ven todo).
-- Idempotente — ejecutable múltiples veces sin efectos secundarios.

-- Columnas (ADD IF NOT EXISTS — las columnas ya se crearon en un paso anterior).
ALTER TABLE team          ADD COLUMN IF NOT EXISTS owner_scope varchar(32);
ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS owner_scope varchar(32);

-- CHECK constraint opcional para permitir sólo valores conocidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_owner_scope_chk'
  ) THEN
    ALTER TABLE team ADD CONSTRAINT team_owner_scope_chk
      CHECK (owner_scope IS NULL OR owner_scope IN ('portillo', 'lukas'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_pipelines_owner_scope_chk'
  ) THEN
    ALTER TABLE crm_pipelines ADD CONSTRAINT crm_pipelines_owner_scope_chk
      CHECK (owner_scope IS NULL OR owner_scope IN ('portillo', 'lukas'));
  END IF;
END$$;

-- Seed asesorias-suiza (scope ONLY — no tocar otros clientes).
WITH suiza AS (
  SELECT id FROM clients WHERE slug = 'asesorias-suiza'
)
UPDATE team SET owner_scope = CASE lower(email)
    WHEN 'portillo@admin.com'      THEN 'portillo'
    WHEN 'portillo@portillo.com'   THEN 'portillo'
    WHEN 'fjr.19927@gmail.com'     THEN 'portillo'  -- Jose fernandez (closer/setter de Portillo)
    WHEN 'lucas@admin.com'         THEN 'lukas'
    WHEN 'luka@luca.com'           THEN 'lukas'
    ELSE NULL
  END
WHERE client_id = (SELECT id FROM suiza);

-- Pipelines — mapping por nombre (match case-insensitive sobre patrones conocidos).
WITH suiza AS (
  SELECT id FROM clients WHERE slug = 'asesorias-suiza'
)
UPDATE crm_pipelines SET owner_scope = CASE
    WHEN name ILIKE '%Portillo%'                   THEN 'portillo'
    WHEN name ILIKE 'FormTrabajoPortillo'          THEN 'portillo'
    WHEN name ILIKE 'Clientes Portillo%'           THEN 'portillo'
    WHEN name ILIKE '%Lukas%'                      THEN 'lukas'
    WHEN name ILIKE 'FormTrabajoLukas'             THEN 'lukas'
    WHEN name ILIKE 'Seguros%'                     THEN 'lukas'
    WHEN name ILIKE 'Europeos a Suiza'             THEN 'lukas'
    ELSE NULL
  END
WHERE client_id = (SELECT id FROM suiza);

-- "Archivo — Ventas Portillo/Lukas (huérfanos)" menciona ambos → compartido (NULL explícito).
UPDATE crm_pipelines SET owner_scope = NULL
WHERE client_id = (SELECT id FROM clients WHERE slug = 'asesorias-suiza')
  AND name ILIKE '%huérfanos%';
