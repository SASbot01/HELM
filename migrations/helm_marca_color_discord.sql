-- HELM — El color de la marca manda, y la comunidad puede vivir en Discord.
--
-- Dos cosas que faltaban para que un perfil se sienta suyo y no de HELM:
--
--   1) El color. `clients.primary_color` existía desde el principio y no lo
--      leía nadie: se guardaba al crear el perfil y ahí se quedaba. El panel se
--      pintaba siempre con el verde de HELM, y al compartir el enlace salía ese
--      verde aunque el negocio fuera de otro color. Ahora es el acento de todo
--      su panel y viaja en la tarjeta del enlace.
--
--   2) Discord. Montar un chat en vivo dentro de HELM es un producto entero;
--      el 90% del valor es que el enlace esté donde la gente lo busca. Se
--      guarda con el resto de la comunidad y sale como botón en el panel y en
--      la página pública.
--
-- Idempotente.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) EL COLOR DEL PERFIL
-- ═══════════════════════════════════════════════════════════════════════════
-- La columna ya existe en `clients` desde la creación de perfiles. Aquí solo se
-- asegura (perfiles antiguos de otra instalación) y se documenta para qué es,
-- que era justo lo que no estaba claro.
alter table clients
  add column if not exists primary_color text;

comment on column clients.primary_color is
  'Color de marca del perfil, en hex (#RRGGBB). Es el acento de TODO su panel '
  '(sustituye al del tema) y el color de la tarjeta al compartir su enlace. '
  'Null o vacío = se usa el acento del tema elegido en Ajustes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DISCORD EN LA COMUNIDAD
-- ═══════════════════════════════════════════════════════════════════════════
alter table helm_community
  add column if not exists discord_url text not null default '';

comment on column helm_community.discord_url is
  'Invitación al Discord de la comunidad (https://discord.gg/...). Vacío = no '
  'se enseña el botón. La formación y el muro siguen viviendo en HELM.';
