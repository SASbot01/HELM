-- 117 — El Media buyer: Meta Ads con topes que solo pone el dueño (28-oct-2026).
--
-- Nivel 1: el agente PROPONE (subir ≤ +20 %, bajar, pausar, pedir
-- creatividades) y el dueño aprueba en la bandeja (helm_propuestas, 116). Al
-- aprobar, las escrituras del bot meta_presupuesto y meta_pausar
-- (api/_lib/bot/escrituras.js) vuelven a leer Meta, comprueban los topes y solo
-- entonces cambian. El único sitio que habla con Meta es api/_lib/meta-ads.js.
--
-- El token (usuario del sistema, Marketing API v26.0) vive en
-- user_integrations con service='meta_ads', como el de Instagram: el navegador
-- nunca lo ve. Aquí, lo demás:
--
--   · helm_ads_cuentas   → cada cuenta publicitaria conectada a un perfil, con
--                          sus TOPES (números, nunca texto de un prompt):
--                          presupuesto diario máximo (la suma de presupuestos
--                          diarios que quedan puestos), tope duro del día (si
--                          el gasto real de hoy lo pasa, el vigilante pausa; por
--                          defecto 1,75 × el diario), tope mensual, % de
--                          subida (≤ 20) y horas entre subidas (≥ 72). Solo los
--                          cambia quien administra la agencia (api/meta-ads.js).
--                          `vigilante` = lo último que vio el vigilante horario.
--   · helm_ads_metricas  → la foto por anuncio y día: lo que dice Meta (gasto,
--                          CTR, frecuencia, leads de Meta) y lo que dice el CRM
--                          (leads por utm_content = id del anuncio y ventas
--                          cobradas contadas por la FECHA EN QUE ENTRÓ EL LEAD).
--   · helm_ads_acciones  → el registro de todo lo que se toca en Meta. SOLO SE
--                          AÑADE: un trigger impide editar o borrar filas. Cada
--                          acción escribe una fila 'intento' ANTES de llamar a
--                          Meta (si no se puede escribir, no se llama) y otra
--                          con el resultado (intento_id → la primera).
--   · helm_ads_paradas   → cada «Parar los anuncios»: la lista exacta de
--                          campañas que se pausaron, para reanudar esas y no
--                          otras.
--
-- Solo el servidor las toca: RLS activado sin políticas, sin permisos para el
-- navegador y fuera de la lista del panel de la pasarela. Idempotente.

begin;

create table if not exists helm_ads_cuentas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- act_<número>. Una cuenta publicitaria, en un solo perfil: dos perfiles con
  -- la misma cuenta tendrían dos juegos de topes.
  cuenta_id text not null unique check (cuenta_id ~ '^act_[0-9]{3,25}$'),
  nombre text,
  moneda text not null default 'EUR',
  zona text not null default 'Europe/Madrid',
  activa boolean not null default true,
  -- 0 = solo mira (el agente no propone; el vigilante solo avisa).
  -- 1 = propone y el dueño aprueba. Nada más, por ahora.
  nivel smallint not null default 1 check (nivel in (0, 1)),
  -- Los topes, en la moneda de la cuenta. Sin topes, el agente no propone subidas.
  tope_diario numeric check (tope_diario is null or tope_diario > 0),
  tope_duro numeric check (tope_duro is null or tope_duro > 0),
  tope_mensual numeric check (tope_mensual is null or tope_mensual > 0),
  subida_max_pct numeric not null default 20 check (subida_max_pct > 0 and subida_max_pct <= 20),
  horas_entre_subidas integer not null default 72 check (horas_entre_subidas >= 72),
  -- Antes de juzgar un anuncio: días publicado y gasto mínimo (× el objetivo).
  dias_min integer not null default 3 check (dias_min >= 3),
  gasto_min_factor numeric not null default 1.5 check (gasto_min_factor >= 1),
  -- El coste objetivo: por lead (captación) y por venta cobrada (carrito).
  objetivo_cpl numeric check (objetivo_cpl is null or objetivo_cpl > 0),
  objetivo_cpa numeric check (objetivo_cpa is null or objetivo_cpa > 0),
  -- captacion: juzga por coste por lead · carrito: por coste por venta ·
  -- cierre: congela los presupuestos y solo vigila.
  fase text not null default 'captacion' check (fase in ('captacion', 'carrito', 'cierre')),
  topes_por text,
  topes_en timestamptz,
  -- { dia, gasto, mes, en, errores, avisos: { p80, duro, mes } }
  vigilante jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tope_duro is null or tope_diario is null or tope_duro >= tope_diario),
  check (tope_mensual is null or tope_diario is null or tope_mensual >= tope_diario)
);
create index if not exists helm_ads_cuentas_perfil on helm_ads_cuentas (client_id);

create table if not exists helm_ads_metricas (
  client_id uuid not null references clients(id) on delete cascade,
  cuenta_id text not null,
  dia date not null,
  ad_id text not null,
  ad_nombre text,
  adset_id text,
  adset_nombre text,
  campaign_id text,
  campaign_nombre text,
  -- Lo que dice Meta.
  gasto numeric not null default 0,
  impresiones integer not null default 0,
  alcance integer not null default 0,
  frecuencia numeric,
  clics integer not null default 0,
  clics_enlace integer not null default 0,
  ctr numeric,
  leads_meta integer not null default 0,
  compras_meta integer not null default 0,
  -- Lo que dice el CRM (por la fecha en que entró el lead).
  leads_crm integer not null default 0,
  ventas_crm integer not null default 0,
  cobrado_crm numeric not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta_id, ad_id, dia)
);
create index if not exists helm_ads_metricas_perfil on helm_ads_metricas (client_id, dia desc);

create table if not exists helm_ads_acciones (
  id uuid primary key default gen_random_uuid(),
  -- Sin clave ajena a propósito: borrar un perfil no puede borrar su registro
  -- (y el trigger de abajo lo impediría, tumbando el borrado del perfil).
  client_id uuid not null,
  cuenta_id text not null,
  -- ad | adset | campaign | cuenta
  objeto_tipo text not null check (objeto_tipo in ('ad', 'adset', 'campaign', 'cuenta')),
  objeto_id text not null,
  objeto_nombre text,
  accion text not null check (accion in ('presupuesto', 'pausar', 'activar', 'parar_todo', 'reanudar_todo', 'topes')),
  antes jsonb,
  despues jsonb,
  -- El porqué, con sus cifras.
  porque text,
  -- Quién lo decidió: el nombre de quien aprobó, «Vigilante de HELM»…
  quien text not null,
  -- agente | vigilante | panel | telegram | aprobado
  origen text not null,
  estado text not null check (estado in ('intento', 'hecho', 'fallido', 'sin_confirmar', 'parcial')),
  -- En las filas de resultado: el intento al que contestan.
  intento_id uuid references helm_ads_acciones(id),
  -- Si deshace otra acción, cuál.
  deshace uuid references helm_ads_acciones(id),
  -- Lo que contestó Meta (sin tokens).
  respuesta jsonb,
  creada_en timestamptz not null default now()
);
create index if not exists helm_ads_acciones_cuenta on helm_ads_acciones (cuenta_id, creada_en desc);
create index if not exists helm_ads_acciones_objeto on helm_ads_acciones (objeto_id, accion, creada_en desc);
create index if not exists helm_ads_acciones_perfil on helm_ads_acciones (client_id, creada_en desc);

-- Solo se añade: nadie edita ni borra el registro (tampoco el servidor).
create or replace function helm_ads_acciones_solo_anadir() returns trigger
language plpgsql as $$
begin
  raise exception 'helm_ads_acciones es un registro: solo se pueden añadir filas';
end;
$$;
drop trigger if exists helm_ads_acciones_no_cambia on helm_ads_acciones;
create trigger helm_ads_acciones_no_cambia
  before update or delete on helm_ads_acciones
  for each row execute function helm_ads_acciones_solo_anadir();
drop trigger if exists helm_ads_acciones_no_vacia on helm_ads_acciones;
create trigger helm_ads_acciones_no_vacia
  before truncate on helm_ads_acciones
  for each statement execute function helm_ads_acciones_solo_anadir();

create table if not exists helm_ads_paradas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  cuenta_id text not null,
  -- [{ id, nombre }]: las campañas que estaban activas y se pausaron.
  objetos jsonb not null default '[]'::jsonb,
  motivo text,
  quien text not null,
  origen text not null,
  -- { pausadas: [ids], fallidas: [{ id, error }] }
  resultado jsonb,
  creada_en timestamptz not null default now(),
  reanudada_en timestamptz,
  reanudada_por text
);
create index if not exists helm_ads_paradas_cuenta on helm_ads_paradas (cuenta_id, creada_en desc);

alter table helm_ads_cuentas enable row level security;
alter table helm_ads_metricas enable row level security;
alter table helm_ads_acciones enable row level security;
alter table helm_ads_paradas enable row level security;
revoke all on helm_ads_cuentas from anon, authenticated;
revoke all on helm_ads_metricas from anon, authenticated;
revoke all on helm_ads_acciones from anon, authenticated;
revoke all on helm_ads_paradas from anon, authenticated;

commit;
