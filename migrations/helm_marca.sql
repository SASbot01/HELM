-- HELM — marca blanca por perfil.
--
-- Cada negocio pone su logo, su nombre y su subtítulo, y el panel entero pasa a
-- verse como software suyo. `logo_url` ya existía en clients (venía de la
-- plataforma antigua); lo que falta es el nombre y el subtítulo de marca, que
-- son distintos del nombre del perfil: el perfil se llama como lo llame quien
-- lo administra, la marca es lo que ve el cliente en la barra lateral.

alter table clients add column if not exists logo_url       text;
alter table clients add column if not exists brand_name     text;
alter table clients add column if not exists brand_subtitle text;

comment on column clients.brand_name is
  'Nombre de marca en la barra lateral. Si es null se usa clients.name.';
comment on column clients.brand_subtitle is
  'Línea pequeña bajo el nombre. Si es null se usa "OPERATING LAYER".';
