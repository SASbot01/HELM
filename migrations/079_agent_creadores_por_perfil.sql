-- Agent OS — qué creadores de referencia usa cada perfil de HELM.
--
-- El corpus (identidades, reels, memoria) sigue siendo del operador y sin
-- client_id: esto solo dice qué identidades "lleva dentro" cada perfil, para
-- que al escribir guiones de detras-de-camra se lea a soybedia y compañía y no
-- a todo el corpus. Un creador puede servir a varios perfiles y al revés.
--
-- Igual que 078: sin policy para anon, solo entra service_role.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_identity_clients (
  identity_id uuid NOT NULL REFERENCES public.agent_identities(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, client_id)
);
CREATE INDEX IF NOT EXISTS agent_identity_clients_client_idx
  ON public.agent_identity_clients (client_id);

ALTER TABLE public.agent_identity_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_identity_clients_srv ON public.agent_identity_clients;
CREATE POLICY agent_identity_clients_srv ON public.agent_identity_clients
  TO service_role USING (true) WITH CHECK (true);

COMMIT;
