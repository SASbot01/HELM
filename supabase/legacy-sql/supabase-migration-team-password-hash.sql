-- Migration: Add password_hash column to team table (BUG-002 fase 2)
-- Pegar en Supabase SQL Editor y ejecutar una sola vez.
--
-- Despues de correr esto, los nuevos miembros se guardan con scrypt en
-- password_hash y el fallback a `password` plano del endpoint POST /api/team
-- deja de activarse. Correr `node scripts/rehash-passwords.mjs` para migrar
-- las filas legacy.

ALTER TABLE team ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE team ALTER COLUMN password DROP NOT NULL;
ALTER TABLE team ALTER COLUMN password SET DEFAULT NULL;

-- (Opcional) refrescar el schema cache de PostgREST inmediatamente:
NOTIFY pgrst, 'reload schema';
