-- 105 — El alta pública de HELM (helm.s4sf.net/alta): antes de tener perfil.
--
-- El «Alta en HELM» (las 40 preguntas de src/helm/onboarding/alta.js) solo se
-- podía rellenar desde un enlace que la agencia saca de un perfil que ya
-- existe (/alta/<token>). Esto es lo de antes: un negocio interesado entra en
-- /alta sin token, deja sus datos de contacto, responde y lo envía; la agencia
-- lo recibe en «Altas recibidas» (tablero de Perfiles) y desde ahí crea el
-- perfil con las respuestas ya dentro (api/onboarding.js).
--
--   · helm_altas → cada alta pública, de una agencia:
--       borrador    ha dejado sus datos y va respondiendo
--       enviada     la ha enviado (enviado_at); la agencia ya está avisada
--       convertida  la agencia ha creado el perfil (client_id); las respuestas
--                   ya están en su onboarding y aquí se vacían
--       descartada  la agencia la ha descartado: se vacían sus datos y sus
--                   respuestas, y queda solo la fila
--     Quien la rellena puede borrarla desde /alta mientras no esté convertida.
--     Los borradores que nadie envía y las descartadas se borran a los 30
--     días (cuando caduca su llave), al abrir la bandeja.
--     La IP no se guarda: solo su huella (ip_hash, HMAC-SHA256 con un secreto
--     del servidor; en IPv6, de su /64), para ver si varias altas salen del
--     mismo sitio. acepta_privacidad_version dice qué texto de la casilla se
--     aceptó (PRIVACIDAD_VERSION en src/pages/altaPublica.js).
--
--   · agencias.perfil_casa_id → el perfil del propio negocio de la agencia (el
--     de Silvestre AI es «silvestre»). Un alta pública aún no es de ningún
--     perfil, y las notificaciones del panel cuelgan de uno: el aviso de «alta
--     nueva» va a su campana, sin datos de contacto. Sin él, solo llega por el
--     bot de Telegram de la agencia y a la bandeja. Nunca el perfil de un
--     cliente. Al borrar ese perfil la columna se vacía sola (ON DELETE SET
--     NULL); el borrado de perfiles (api/perfiles.js) se salta `agencias`.
--
-- Solo el servidor toca helm_altas: RLS activado sin políticas y fuera de la
-- puerta del panel (SECRETAS en api/_lib/pasarela.js).
--
-- Idempotente: se puede volver a pasar sin romper nada.

begin;

create table if not exists helm_altas (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id) on delete cascade,
  -- Quién la rellena (el contacto) y su negocio (la respuesta 1, al enviarla).
  nombre text not null default '',
  email text not null default '',
  telefono text not null default '',
  negocio text not null default '',
  -- Las respuestas, por clave de ONBOARDING_ALTA (validadas por validarAlta).
  answers jsonb not null default '{}'::jsonb,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'convertida', 'descartada')),
  -- El perfil que se creó con ella.
  client_id uuid references clients(id) on delete set null,
  -- utm_* y referrer, recortados.
  origen jsonb not null default '{}'::jsonb,
  ip_hash text not null default '',
  acepta_privacidad_at timestamptz,
  acepta_privacidad_version text not null default '',
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists helm_altas_agencia_idx
  on helm_altas (agencia_id, estado, created_at desc);

alter table helm_altas enable row level security;
revoke all on helm_altas from anon, authenticated;

alter table agencias add column if not exists perfil_casa_id uuid references clients(id) on delete set null;

-- La de la casa: su perfil es «silvestre» (el de las landings propias, ver
-- api/leads.js). Solo si es de la agencia y nadie lo ha puesto ya.
update agencias a set perfil_casa_id = c.id
from clients c
where a.slug = 'silvestreai' and a.perfil_casa_id is null
  and c.slug = 'silvestre' and c.agencia_id = a.id;

commit;

notify pgrst, 'reload schema';
