-- HELM — permisos de VISIBILIDAD por rol.
--
-- `helm_permissions.matrix` ya decía quién puede EDITAR cada área. El criterio
-- de entonces era que todo el mundo viera el panel entero y solo se limitara la
-- edición. Con closers y setters entrando con su propia cuenta eso no vale: un
-- closer no tiene por qué ver las finanzas del negocio ni el equipo ni lo que
-- cobra cada uno.
--
-- Así que se añade una segunda matriz. `matrix` = qué puede tocar; `visible` =
-- qué secciones le aparecen siquiera en el menú.
--
--   visible = { "closer": ["crm","diario"], "setter": ["crm","diario"], ... }
--
-- Vacío significa "usa los valores por defecto de src/helm/permisos.js", no
-- "no ve nada": así los perfiles que ya existen no se quedan a oscuras al
-- aplicar esto.

alter table helm_permissions
  add column if not exists visible jsonb not null default '{}'::jsonb;

comment on column helm_permissions.matrix is
  'Qué áreas puede EDITAR cada rol. {rol: [area]}';
comment on column helm_permissions.visible is
  'Qué secciones VE cada rol en el menú. {rol: [seccion]}. Vacío = defaults de la app.';
