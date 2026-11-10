-- HELM — material comercial en Documentos.
--
-- Los PDF de venta siguen en helm_library (la Biblioteca). Se marcan con la
-- etiqueta exacta `comercial` dentro de `tags` (jsonb), que ya existía. No hay
-- tabla nueva ni bucket nuevo, y no se toca RLS, la pasarela ni CORS.
-- helm_library sigue siendo por `client_id` (el perfil): no existe profile_id.
--
-- Este archivo NO etiqueta documentos. Qué PDF es material de venta lo decide
-- el negocio; el paso está comentado al final para copiarlo con sus ids.
--
-- Lo que sí hace: en los permisos ya guardados, setter y closer pasan a ver
-- la sección Documentos. Sin esto, un perfil que guardó su matriz se queda
-- con la lista vieja (crm, diario, tareas) y el equipo de ventas no ve la
-- sección. Quien no ha guardado permisos, o no tiene la clave de ese rol,
-- sigue en DEFAULT_VISIBLE del código y no necesita esta fila.
--
-- Idempotente: se puede volver a aplicar. No duplica la sección.

comment on column public.helm_library.tags is
  'Etiquetas libres (jsonb, array de texto). La etiqueta exacta comercial marca un PDF como material de venta: lo ve el equipo en Documentos → Material comercial. El archivo se abre por file_url, igual que en la Biblioteca.';

update public.helm_permissions
set
  visible = (
    select jsonb_object_agg(
      e.key,
      case
        when e.key in ('setter', 'closer')
          and jsonb_typeof(e.value) = 'array'
          and not (e.value @> '["documentos"]'::jsonb)
        then e.value || '["documentos"]'::jsonb
        else e.value
      end
    )
    from jsonb_each(visible) as e
  ),
  updated_at = now()
where jsonb_typeof(visible) = 'object'
  and (
    (jsonb_typeof(visible->'setter') = 'array' and not (visible->'setter' @> '["documentos"]'::jsonb))
    or
    (jsonb_typeof(visible->'closer') = 'array' and not (visible->'closer' @> '["documentos"]'::jsonb))
  );

-- ── Paso de datos, a mano: marcar PDF ya subidos ──────────────────────────
-- No se ejecuta solo. Sustituye el perfil y los ids (o los títulos).
--
-- update public.helm_library
-- set
--   tags = (
--     select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
--     from (
--       select jsonb_array_elements_text(
--         case when jsonb_typeof(tags) = 'array' then tags else '[]'::jsonb end
--       ) as x
--       union all
--       select 'comercial'
--     ) s
--   ),
--   updated_at = now()
-- where client_id = '<UUID DEL PERFIL>'
--   and id in ('<UUID DOC 1>', '<UUID DOC 2>')
--   and (
--     lower(file_name) like '%.pdf'
--     or lower(split_part(split_part(file_url, '?', 1), '#', 1)) like '%.pdf'
--   );
