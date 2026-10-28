-- HELM — Laurent como superadmin.
--
-- Un superadmin ve TODOS los perfiles de HELM, no solo el suyo: el CRM, las
-- ventas y las finanzas de Detrás de Cámara, Hugo, Silvestre y los demás. Que
-- quede escrito, porque desde la tabla no se ve la diferencia con un admin
-- normal y son cosas muy distintas.
--
-- Laurent ya era admin de SU perfil (team.role = 'admin,ceo,director', y dueño
-- en su directorio de equipo). Esto es el escalón de encima.

-- ── 1) Hash en superadmins ────────────────────────────────────────────────
-- La tabla solo guardaba `password` en texto plano. `verifyPassword` ya prefiere
-- password_hash cuando existe (formato scrypt:salt:hash, ver api/_lib/
-- passwords.js), así que la columna es aditiva: las cuentas que siguen en plano
-- entran igual que antes.
--
-- Hace falta aquí para no inventarle una contraseña nueva a Laurent: la suya ya
-- está hasheada en `team` y se copia tal cual.
alter table superadmins add column if not exists password_hash text;

comment on column superadmins.password_hash is
  'Hash scrypt:salt:hash. Tiene prioridad sobre `password` (texto plano legacy) '
  'en verifyPassword. Ojo: scripts/reset-superadmin-pass.sh escribe `password`, '
  'que no sirve de nada en una fila que ya tenga hash.';

-- ── 2) El acceso ──────────────────────────────────────────────────────────
do $$
declare
  v_hash text;
begin
  select password_hash into v_hash
    from team where lower(email) = 'laurent@drak-ma.com' and password_hash is not null
    limit 1;

  if v_hash is null then
    raise notice '[HELM] Laurent no tiene password_hash en team. NO se ha creado el superadmin: hazlo a mano con una contraseña nueva.';
    return;
  end if;

  -- Copiar el hash y no pedirle una contraseña nueva: entra con la que ya usa.
  -- El login mira `superadmins` ANTES que `team`, así que a partir de ahora esa
  -- misma contraseña le abre el panel completo en vez de solo su perfil.
  insert into superadmins (name, email, password, password_hash, active)
  values ('Laurent', 'laurent@drak-ma.com', '', v_hash, true)
  on conflict (email) do update
     set password_hash = excluded.password_hash,
         active        = true;

  raise notice '[HELM] Laurent es superadmin. Entra con su contraseña de siempre.';
end $$;
