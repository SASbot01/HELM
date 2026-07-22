-- 2026-05-04 — F2 + F3 RLS efectivo: team / legal / manychat / email / whatsapp.
--
-- Cierra el resto de los agujeros de la matriz cosmética. Antes:
--   - team:             anon ALL (qual=true)
--   - legal_documents:  anon ALL (qual=true)
--   - manychat_config:  anon ALL (qual=true)
--   - email_config:     anon ALL (qual=true)
--   - whatsapp_config:  rowsecurity=false (sin RLS — creds expuestas en lectura)
--
-- Después: anon SELECT permitido (frontend sigue leyendo para mostrar UI),
-- INSERT/UPDATE/DELETE denegados. Todos los writes pasan por backend con
-- role check (team:create/edit/delete, legal:upload/delete, integrations:edit).

BEGIN;

-- ── team ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on team" ON public.team;

CREATE POLICY "anon_select_team" ON public.team
  FOR SELECT TO anon USING (true);
-- INSERT/UPDATE/DELETE: sin policy para anon → default deny.
CREATE POLICY "service_all_team" ON public.team
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── legal_documents ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon" ON public.legal_documents;

CREATE POLICY "anon_select_legal_documents" ON public.legal_documents
  FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_legal_documents" ON public.legal_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── manychat_config ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON public.manychat_config;
DROP POLICY IF EXISTS "service_role all" ON public.manychat_config;

CREATE POLICY "anon_select_manychat_config" ON public.manychat_config
  FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_manychat_config" ON public.manychat_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── email_config ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON public.email_config;

CREATE POLICY "anon_select_email_config" ON public.email_config
  FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_email_config" ON public.email_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── whatsapp_config ──────────────────────────────────────────────
-- Antes: rowsecurity=false → cualquiera con anon key veía/escribía las creds
-- de WhatsApp. Habilitamos RLS y creamos policies estrictas.
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_whatsapp_config" ON public.whatsapp_config
  FOR SELECT TO anon USING (true);
CREATE POLICY "service_all_whatsapp_config" ON public.whatsapp_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
