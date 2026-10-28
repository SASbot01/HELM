-- HELM — la clave pública ya no abre nada.
--
-- La clave anon de Supabase va dentro del JS que se descarga cualquiera. Hasta
-- ahora casi todas las tablas la dejaban leer y escribir (reglas "todo vale"),
-- y el bucket de archivos dejaba subir y BORRAR cualquier archivo. Con varias
-- agencias, eso es que cada una puede leer los clientes de las demás.
--
-- Desde la reforma de agencias nadie la necesita:
--   · el panel habla con /api/db (api/_lib/pasarela.js) con su sesión, y el
--     servidor reenvía con la clave de servicio, recortando por agencia;
--   · las páginas públicas (landings, /f/, portal de documentos) van por
--     endpoints del servidor (api/leads.js, api/formularios.js, api/documentos.js);
--   · los enlaces públicos de archivos (bucket público) no pasan por estas
--     reglas, y las subidas del portal van con URL firmada por el servidor.
--
-- ANTES de aplicar esto tiene que estar desplegado el frontend nuevo: el
-- antiguo hablaba con la base con la clave pública y se quedaría sin datos.
--
-- Para deshacer (solo en una emergencia): grant all on all tables in schema
-- public to anon; y recrear las tres políticas del bucket de abajo.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

-- Lo que se cree a partir de ahora tampoco nace abierto.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- El bucket `helm`: subir, listar y borrar solo el servidor (clave de
-- servicio, que no pasa por estas reglas). Ver archivos sigue funcionando
-- por su enlace público.
drop policy if exists helm_bucket_write on storage.objects;
drop policy if exists helm_bucket_read on storage.objects;
drop policy if exists helm_bucket_delete on storage.objects;
