-- 2026-05-04 — F1 RLS efectivo: deny DELETE a anon en crm_contacts y sales.
--
-- Hasta ahora las policies eran "Service role full access" con qual=true
-- aplicada a `public` — eso permitía DELETE/UPDATE/INSERT/SELECT a anon
-- (que es el rol con el que el frontend conecta a Supabase).
--
-- Con esto:
--   - anon: SELECT + INSERT + UPDATE permitidos (frontend sigue funcionando).
--   - anon: DELETE bloqueado (default deny — no hay policy DELETE para anon).
--   - service_role: ALL permitido — los endpoints `/api/crm/delete-contact`
--     y `/api/sales/delete` usan service_role tras validar rol del miembro.
--
-- Frontend ya migrado en este mismo PR:
--   - src/utils/data.js: deleteCrmContact, deleteImportedCrmContacts,
--     deleteSale ahora hacen fetch a los endpoints en lugar de Supabase
--     directo. Si el frontend intenta DELETE directo, falla con 403.

BEGIN;

-- ── crm_contacts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on crm_contacts" ON public.crm_contacts;

CREATE POLICY "anon_select_crm_contacts" ON public.crm_contacts
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_crm_contacts" ON public.crm_contacts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_crm_contacts" ON public.crm_contacts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- DELETE: sin policy para anon → default deny
CREATE POLICY "service_all_crm_contacts" ON public.crm_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── sales ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on sales" ON public.sales;

CREATE POLICY "anon_select_sales" ON public.sales
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_sales" ON public.sales
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_sales" ON public.sales
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- DELETE: sin policy para anon → default deny
CREATE POLICY "service_all_sales" ON public.sales
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
