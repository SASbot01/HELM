-- 127 — Clave de Claude por agencia («trae tu propia clave»).
--
-- En el modelo nuevo HELM no pone la IA: cada agencia mete SU clave de Anthropic
-- en Ajustes de la agencia y sus agentes (editor de reels, portadas, trial,
-- setter, el chat…) llaman a Claude con ella. La agencia paga su consumo a
-- Anthropic directamente; HELM solo cobra la licencia anual.
--
-- La clave vive aquí, en la fila de la agencia. Nunca sale al rol anónimo: la
-- leen el cliente de servicio del backend (api/_lib/creditos.js →
-- claveClaudeDeAgencia) y nadie más. El panel solo ve los últimos 4 caracteres.
--
-- (Las claves POR PERFIL siguen en user_integrations, como hasta ahora; esta es
-- la de la agencia entera, que se usa cuando un perfil no tiene la suya.)
--
-- Idempotente.

alter table agencias add column if not exists claude_api_key text;

-- Que el rol anónimo no pueda leerla aunque alguien afloje una policy: se revoca
-- explícitamente el acceso a la columna (las agencias ya tienen RLS por su lado).
do $$
begin
  revoke select (claude_api_key) on agencias from anon;
exception when others then
  -- Si el rol no existe o ya estaba revocado, no pasa nada.
  null;
end $$;
