-- 061 · booking_routing_forms — flags para LLM scoring opcional
--
-- El cliente Asesoría Suiza pidió poder evaluar respuestas open-text con un
-- LLM (Claude) y usar el score en las reglas de routing. Es OPCIONAL por
-- form: si use_llm_scoring=false, las reglas booleanas existentes funcionan
-- igual. Si =true, el resolver llama a Anthropic con la API key del tenant
-- (api/lib/anthropic-tenant.js) y inyecta `scores` en `answers` antes de
-- evaluar reglas con operadores score_gte / score_lte.
--
-- score_keys = JSONB array de keys de questions a puntuar (open-text).
-- llm_scoring_prompt = system prompt opcional. Si vacío, usa default que
-- evalúa "intent comercial / fit del lead" en escala 0-100.
--
-- Idempotente.
-- ROLLBACK:
--   ALTER TABLE booking_routing_forms DROP COLUMN IF EXISTS use_llm_scoring;
--   ALTER TABLE booking_routing_forms DROP COLUMN IF EXISTS llm_scoring_prompt;
--   ALTER TABLE booking_routing_forms DROP COLUMN IF EXISTS score_keys;

ALTER TABLE booking_routing_forms
  ADD COLUMN IF NOT EXISTS use_llm_scoring     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS llm_scoring_prompt  TEXT,
  ADD COLUMN IF NOT EXISTS score_keys          JSONB NOT NULL DEFAULT '[]'::jsonb;
