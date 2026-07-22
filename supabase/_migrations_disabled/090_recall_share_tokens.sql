-- 090_recall_share_tokens.sql
-- Cada call Recall tiene un token público shareable (estilo Fathom).
-- El token se genera al crear el bot y va en el link /calls/<token>
-- que renderiza video + transcripción + summary sin auth gate.

ALTER TABLE recall_calls
  ADD COLUMN IF NOT EXISTS share_token text;

-- Backfill: genera token para filas existentes
UPDATE recall_calls
SET share_token = encode(gen_random_bytes(16), 'hex')
WHERE share_token IS NULL;

-- Único + index
CREATE UNIQUE INDEX IF NOT EXISTS idx_recall_calls_share_token
  ON recall_calls (share_token)
  WHERE share_token IS NOT NULL;
