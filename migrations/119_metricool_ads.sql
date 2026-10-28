-- 119 — Métricas de anuncios leídas de Metricool (solo lectura).
--
-- Metricool agrega Meta, TikTok y Google Ads. Su API no gestiona campañas:
-- HELM solo lee. Pausar y cambiar presupuestos sigue en Meta
-- (api/_lib/meta-ads.js, migración 117).
--
--   · helm_metricool_ads → una fila por perfil, marca (blog_id), red, día y
--     anuncio (o campaña, si Metricool no da el anuncio). El gasto se cruza
--     con el CRM (leads por utm_content = id del anuncio, ventas cobradas por
--     la fecha en que entró el lead), igual que helm_ads_metricas.
--     Upsert por la clave primaria: sincronizar otra vez no duplica.
--   · agencias.metricool → credenciales de la cuenta Metricool de la agencia,
--     { "user_id", "user_token" }. El token no va en el repositorio. Si es
--     null, se usan METRICOOL_USER_ID y METRICOOL_USER_TOKEN.
--
-- Qué marca de Metricool es cada perfil no va aquí: va en user_integrations
-- (service = 'metricool', config.blog_id) o en METRICOOL_BRANDS. Ver
-- docs/metricool.md.
--
-- Solo el servidor las toca. Idempotente.

begin;

create table if not exists helm_metricool_ads (
  client_id uuid not null references clients(id) on delete cascade,
  -- El blogId de la marca en Metricool.
  blog_id text not null,
  -- meta | tiktok | google
  red text not null check (red in ('meta', 'tiktok', 'google')),
  dia date not null,
  -- ad | conjunto | campana. Sin id de anuncio se guarda la campaña, para no
  -- perder Google (Metricool no publica un bloque de anuncios de Google).
  nivel text not null default 'ad' check (nivel in ('ad', 'conjunto', 'campana')),
  campaign_id text not null default '',
  campaign_nombre text,
  adset_id text not null default '',
  adset_nombre text,
  ad_id text not null default '',
  ad_nombre text,
  gasto numeric not null default 0,
  impresiones integer not null default 0,
  alcance integer not null default 0,
  clics integer not null default 0,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  -- Lo que cuenta la plataforma (leads / resultados y conversiones).
  leads numeric not null default 0,
  conversiones numeric not null default 0,
  moneda text,
  -- Lo que dice el CRM.
  leads_crm integer not null default 0,
  ventas_crm integer not null default 0,
  cobrado_crm numeric not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (client_id, blog_id, red, dia, campaign_id, adset_id, ad_id)
);

create index if not exists helm_metricool_ads_perfil on helm_metricool_ads (client_id, dia desc);
create index if not exists helm_metricool_ads_anuncio on helm_metricool_ads (client_id, red, ad_id, dia desc);

alter table helm_metricool_ads enable row level security;
revoke all on helm_metricool_ads from anon, authenticated;

alter table agencias add column if not exists metricool jsonb;

comment on table helm_metricool_ads is
  'Métricas diarias de anuncios leídas de Metricool (solo lectura). No sirve para pausar ni cambiar presupuestos.';

comment on column agencias.metricool is
  'Credenciales Metricool de la agencia: { "user_id", "user_token" }. Si es null, METRICOOL_USER_ID y METRICOOL_USER_TOKEN.';

commit;
