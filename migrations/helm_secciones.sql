-- HELM — secciones del negocio que se pueden apagar.
--
-- Plugins ya dejaba añadir módulos, pero al revés no había nada: un negocio que
-- no vende por llamada tenía Diario y Llamadas en el menú para siempre, y un
-- infoproducto sin comunidad veía dos secciones que no iba a abrir nunca. Con
-- esto cada perfil deja en el menú solo lo que usa.
--
-- Vive en `helm_permissions` y no en localStorage (como los plugins) a
-- propósito: es una decisión DEL NEGOCIO, no del navegador de quien la tomó. Si
-- el dueño apaga Finanzas, tiene que estar apagada también para su equipo y en
-- su móvil.
--
-- Solo se guardan las que están APAGADAS ({"diario": false}). Así una sección
-- nueva de HELM aparece encendida por defecto en todos los perfiles, sin tener
-- que tocar la fila de cada uno.
--
-- Idempotente: se puede aplicar más de una vez sin riesgo.

alter table helm_permissions
  add column if not exists sections jsonb not null default '{}'::jsonb;

comment on column helm_permissions.sections is
  'Secciones del menú apagadas en este perfil: {"diario": false}. Lo que no '
  'aparece está encendido. Ajustes y Secciones no se pueden apagar (dejarían '
  'el panel sin forma de volver a encenderlas).';
