-- HELM — fuera la columna de contraseñas en claro.
--
-- `team.password` y `superadmins.password` eran de la época anterior al hash
-- (scrypt en password_hash). El 2026-10-12 no quedaba ninguna fila con valor,
-- y el login ya solo acepta password_hash (api/_lib/passwords.js). Borrar la
-- columna asegura que nadie vuelva a guardar una en claro por error.
--
-- Va DESPUÉS de desplegar el código nuevo: el login antiguo pedía la columna
-- en su select y fallaría sin ella.

alter table team drop column if exists password;
alter table superadmins drop column if exists password;
