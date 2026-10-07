-- Agent OS — un enlace del conector de Claude por perfil (api/mcp/[token].js).
--
-- El token maestro (HELM_MCP_TOKEN en .env.server) es del operador y lo ve
-- todo. Estos son los de cada cliente: el conector solo le enseña SU perfil,
-- sus creadores y su calendario.
--
-- Se guarda el sha256 del token, nunca el token: quien lea la tabla no puede
-- conectarse. El token solo se enseña una vez, al generarlo en HELM.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_mcp_tokens (
  token_hash  text PRIMARY KEY,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz
);
-- Uno por perfil: generar otro revoca el anterior.
CREATE UNIQUE INDEX IF NOT EXISTS agent_mcp_tokens_client_idx ON public.agent_mcp_tokens (client_id);

ALTER TABLE public.agent_mcp_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_mcp_tokens_srv ON public.agent_mcp_tokens;
CREATE POLICY agent_mcp_tokens_srv ON public.agent_mcp_tokens TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.agent_mcp_tokens FROM anon, authenticated;

COMMIT;
