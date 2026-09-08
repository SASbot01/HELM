-- 018_rls_policies.sql
-- RLS (Row Level Security) multi-tenant — BORRADOR, NO EJECUTAR EN FRÍO.
--
-- ⚠️ LEER ANTES DE APLICAR
-- =========================
-- Hoy el frontend de Dashboard-Ops- se conecta a Supabase con la ANON KEY
-- directamente desde el navegador. Si activamos RLS estricto ahora con
-- "anon = sin acceso", todas las páginas del SaaS se quedan sin datos.
--
-- Plan de aplicación en 3 fases:
--
--   FASE A (ya): service_role bypass. Backend API (api/*) seguirá funcionando
--                porque usa SUPABASE_SERVICE_KEY. Nada se rompe.
--
--   FASE B: bloquear INSERT/UPDATE/DELETE desde anon.
--           El frontend lee con anon (riesgo de fuga read-only, igual que hoy)
--           pero NO puede modificar datos. Todas las mutaciones deben pasar
--           por api/* (con service_key). Esto cierra la mitad del agujero.
--
--   FASE C: bloquear también SELECT desde anon. Requiere antes:
--           (1) Migrar el frontend a Supabase Auth (supabase.auth.signIn),
--           o (2) Enrutar todas las lecturas del frontend por api/* con JWT.
--
-- Para activar cada fase, descomenta la sección correspondiente y ejecuta
-- en el SQL Editor de Supabase. Prueba siempre en un proyecto Supabase
-- staging antes de prod.
-- ============================================================================

-- Listado de tablas con client_id (actualízalo si añades tablas):
--
--   sales, reports, team, projections, payment_fees, products, n8n_config,
--   crm_contacts, crm_activities, crm_pipelines, crm_stages, superadmin_commissions,
--   ceo_meetings, ceo_projects, ceo_ideas, ceo_daily_digests, ceo_weekly_digests,
--   ceo_team_notes, ceo_integrations, ceo_finance_entries,
--   user_integrations, agent_runs, agent_brain,
--   audit_logs, events, subscriptions, invoices
--
-- Tablas SIN client_id (globales — cuidado):
--   clients, superadmins, subscription_plans

-- ============================================================================
-- FASE A — habilitar RLS + service_role bypass
-- ============================================================================
-- Este bloque es seguro aplicar: no cambia comportamiento porque api/* usa
-- service_role key, y por defecto Postgres permite superusers. Al habilitar
-- RLS sin policies, anon quedaría sin acceso. Pero aquí añadimos policies
-- permisivas temporales para anon para no romper nada.

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'sales','reports','team','projections','payment_fees','products','n8n_config',
      'crm_contacts','crm_activities','crm_pipelines','superadmin_commissions',
      'ceo_meetings','ceo_projects','ceo_ideas','ceo_daily_digests','ceo_weekly_digests',
      'ceo_team_notes','ceo_integrations','ceo_finance_entries',
      'audit_logs','events','subscriptions','invoices'
    ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table %I enable row level security;', t);
      execute format('alter table %I force row level security;', t);  -- aplica también a owners
      -- Bypass para service_role (backend API)
      execute format($f$
        drop policy if exists srv_all on %I;
        create policy srv_all on %I
          for all
          to service_role
          using (true) with check (true);
      $f$, t, t);
      -- TEMPORAL: anon permissive (FASE A). Elimina en FASE B.
      execute format($f$
        drop policy if exists anon_temp_all on %I;
        create policy anon_temp_all on %I
          for all
          to anon
          using (true) with check (true);
      $f$, t, t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- FASE B — bloquear escrituras desde anon (descomentar para activar)
-- ============================================================================
-- Ejecutar cuando estés seguro de que el frontend SOLO lee con anon y
-- TODAS las mutaciones pasan por api/* con service_key.
--
-- do $$
-- declare t text;
-- begin
--   for t in
--     select unnest(array[
--       'sales','reports','team','projections','payment_fees','products','n8n_config',
--       'crm_contacts','crm_activities','crm_pipelines','superadmin_commissions',
--       'ceo_meetings','ceo_projects','ceo_ideas','ceo_daily_digests','ceo_weekly_digests',
--       'ceo_team_notes','ceo_integrations','ceo_finance_entries',
--       'audit_logs','events','subscriptions','invoices'
--     ])
--   loop
--     if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
--       execute format('drop policy if exists anon_temp_all on %I;', t);
--       execute format($f$
--         create policy anon_read on %I for select to anon using (true);
--       $f$, t);
--       -- No INSERT/UPDATE/DELETE para anon.
--     end if;
--   end loop;
-- end $$;

-- ============================================================================
-- FASE C — tenant isolation estricto (descomentar para activar)
-- ============================================================================
-- Requisito previo: el frontend debe enviar JWT con claim 'client_id' en el
-- token de Supabase Auth (custom claim en JWT template), O todas las lecturas
-- del frontend pasan por api/* con service_key y ya no se usa anon key en el
-- navegador.
--
-- La policy filtra por (auth.jwt()->>'client_id')::uuid = tabla.client_id.
--
-- do $$
-- declare t text;
-- begin
--   for t in
--     select unnest(array[
--       'sales','reports','team','projections','payment_fees','products','n8n_config',
--       'crm_contacts','crm_activities','crm_pipelines','superadmin_commissions',
--       'ceo_meetings','ceo_projects','ceo_ideas','ceo_daily_digests','ceo_weekly_digests',
--       'ceo_team_notes','ceo_integrations','ceo_finance_entries',
--       'audit_logs','events','subscriptions','invoices'
--     ])
--   loop
--     if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
--       execute format('drop policy if exists anon_read on %I;', t);
--       execute format('drop policy if exists anon_temp_all on %I;', t);
--       execute format($f$
--         create policy tenant_isolation on %I
--           for all
--           to authenticated
--           using (
--             (auth.jwt()->>'superadmin')::boolean = true
--             or (auth.jwt()->>'client_id')::uuid = client_id
--           )
--           with check (
--             (auth.jwt()->>'superadmin')::boolean = true
--             or (auth.jwt()->>'client_id')::uuid = client_id
--           );
--       $f$, t);
--     end if;
--   end loop;
-- end $$;
--
-- Tablas globales (sin client_id) — policies específicas:
-- clients: read para todos authenticated, write solo superadmin
-- superadmins: solo superadmin
-- subscription_plans: read para todos authenticated, write solo superadmin
--
-- alter table clients enable row level security;
-- create policy clients_read on clients for select to authenticated using (true);
-- create policy clients_write on clients for all to authenticated
--   using ((auth.jwt()->>'superadmin')::boolean = true)
--   with check ((auth.jwt()->>'superadmin')::boolean = true);
--
-- alter table superadmins enable row level security;
-- create policy superadmins_self on superadmins for all to authenticated
--   using ((auth.jwt()->>'superadmin')::boolean = true)
--   with check ((auth.jwt()->>'superadmin')::boolean = true);
--
-- alter table subscription_plans enable row level security;
-- create policy plans_read on subscription_plans for select to anon, authenticated using (active = true);
-- create policy plans_write on subscription_plans for all to authenticated
--   using ((auth.jwt()->>'superadmin')::boolean = true)
--   with check ((auth.jwt()->>'superadmin')::boolean = true);

-- ============================================================================
-- Audit
-- ============================================================================
-- Al ejecutar cualquier fase, registra en audit_logs a qué fase has llegado:
-- insert into audit_logs (action, metadata) values ('rls.phase_a_applied', '{}'::jsonb);
