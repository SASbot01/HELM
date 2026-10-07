-- 084_mid_community_members.sql
-- Acceso directo a una comunidad sin pasar por una formación.
--
-- Hasta ahora una comunidad solo era visible al user si tenía suscripción
-- a la training_route ligada (mid_route_subscriptions). Esto bloquea casos
-- típicos: alumnos antiguos que vienen de otra plataforma, invitados,
-- equipo del cliente, beta-testers… que necesitan entrar al chat sin
-- comprar/inscribirse a un curso.
--
-- mid_community_members es el grant directo: si existe row, el user ve la
-- comunidad aunque no esté inscrito a la route. Es aditivo (OR con
-- mid_route_subscriptions), no reemplaza el flujo normal.

CREATE TABLE IF NOT EXISTS mid_community_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug   TEXT NOT NULL,
  community_id  UUID NOT NULL REFERENCES mid_communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES infoproducto_users(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES infoproducto_users(id) ON DELETE SET NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS mid_community_members_tenant_idx
  ON mid_community_members (tenant_slug, user_id);

CREATE INDEX IF NOT EXISTS mid_community_members_community_idx
  ON mid_community_members (community_id);

COMMENT ON TABLE mid_community_members IS
  'Grant directo de acceso a una comunidad sin necesidad de mid_route_subscriptions. Usado por admins para invitar a usuarios sueltos (alumnos antiguos, team, beta) que necesitan ver el chat sin inscribirse a una formación.';
