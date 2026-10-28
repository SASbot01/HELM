-- HELM — registro con aprobación + guía de bienvenida.
--
-- guide_seen: marca si el usuario ya pasó la guía obligatoria de 15 páginas que
-- salta en su primer login. El registro crea el negocio (clients.active=false) y
-- su acceso (team.active=false); un superadmin los aprueba desde /usersadmin.

alter table team add column if not exists guide_seen boolean not null default false;
