-- HELM — Ads con test de 5 días por conversiones UTM.
--
-- Un ad es un anuncio del perfil. Al marcarlo «Publicado» arranca un test: HELM
-- cuenta los leads (crm_contacts) y ventas (sales) atribuidos a su UTM durante 5
-- días y el equipo deja un veredicto de si funciona o no. Vive dentro de la
-- sección Roadmap, junto al contenido orgánico.
create table if not exists public.helm_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  nombre text not null,
  plataforma text,                                   -- meta | instagram | tiktok | google | otra
  objetivo text,                                     -- qué busca el ad (texto libre)
  utm text not null,                                 -- utm_content que atribuye leads/ventas
  presupuesto numeric,                               -- € invertidos (opcional, para ROAS)
  publicado_en date,                                 -- se rellena al marcar «Publicado»
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en_test', 'evaluado', 'pausado')),
  veredicto text check (veredicto in ('funciona', 'ajustar', 'no_funciona')),
  estudio jsonb,                                      -- { leads, ventas, ingresos, por_dia, conclusion, al_dia }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists helm_ads_client_idx on public.helm_ads (client_id, publicado_en desc nulls last);
-- Para atribuir rápido: buscar conversiones por UTM.
create index if not exists helm_ads_utm_idx on public.helm_ads (client_id, utm);

alter table public.helm_ads enable row level security;
do $$ begin
  drop policy if exists helm_ads_all on public.helm_ads;
  create policy helm_ads_all on public.helm_ads for all using (true) with check (true);
end $$;
