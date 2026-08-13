-- HELM — Scraper: la misma bandeja de prospectos, con cinco orígenes.
--
-- Hasta ahora solo entraba Google Maps (ver helm_prospeccion.sql). El resto del
-- circuito ya estaba resuelto y es lo caro: bandeja de espera antes del CRM,
-- descarte que no vuelve a salir, deduplicación por teléfono y enriquecimiento
-- leyendo la web del negocio. Añadir una fuente nueva no debería costar una
-- tabla nueva ni una pantalla nueva — solo decir de dónde viene cada fila.
--
-- Por eso esto es una columna, no un modelo aparte:
--
--   maps      → Places API de Google. Negocios con ficha, teléfono y reseñas.
--   borme     → Registro Mercantil (BOE). Sociedades recién constituidas y
--               nombramientos de administradores. Es la ÚNICA fuente que da
--               nombre y apellidos de una persona, porque los publica un
--               registro oficial.
--   osm       → OpenStreetMap vía Overpass. Lo mismo que Maps pero sin clave ni
--               factura; a cambio, la ficha es la que haya subido la comunidad.
--   buscador  → Búsqueda web por huella (Brave Search API): `site:`, comillas y
--               operadores. Devuelve dominios, y el enriquecimiento hace el resto.
--   lista     → Lo que pega el usuario: CSV, URLs o teléfonos sueltos. Sin red,
--               sin clave: normaliza, deduplica y entra por el mismo sitio.
--
-- `place_id` deja de ser "el id de Google" y pasa a ser "el id en su fuente",
-- con prefijo (`osm:node/123`, `borme:BORME-A-2026-150-03:365987`, `web:dominio`).
-- Los de Maps se quedan tal cual: son opacos y no chocan con nada prefijado, y
-- reescribirlos habría desconectado los contactos ya importados de su origen.
--
-- Idempotente.

alter table helm_prospects
  add column if not exists fuente text not null default 'maps';

alter table helm_prospect_searches
  add column if not exists fuente text not null default 'maps',
  -- Lo que se pidió, tal cual, para poder repetir una búsqueda buena y para
  -- que el histórico signifique algo cuando cada fuente tiene sus campos: en
  -- BORME es provincia y días; en el buscador, la consulta con sus operadores.
  add column if not exists params jsonb not null default '{}'::jsonb;

-- No hay `check` sobre `fuente` a propósito: cada fuente nueva obligaría a
-- migrar la tabla antes de poder desplegar el código, y el valor no lo escribe
-- el usuario — lo pone el servidor desde su catálogo (api/_lib/fuentes).
comment on column helm_prospects.fuente is
  'De dónde salió la fila: maps | borme | osm | buscador | lista. El catálogo '
  'real vive en api/_lib/fuentes/index.js.';

-- El filtro de la pantalla es (perfil, fuente, estado): sin este índice, un
-- perfil con 20.000 prospectos recorre la tabla entera cada vez que alguien
-- cambia de pestaña.
create index if not exists helm_prospects_fuente_idx
  on helm_prospects (client_id, fuente, estado, created_at desc);

create index if not exists helm_prospect_searches_fuente_idx
  on helm_prospect_searches (client_id, fuente, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE TRAE CADA FUENTE Y NO CABE EN LAS COLUMNAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Va todo a `extra` (que ya existe) en vez de abrir una columna por fuente:
--
--   borme     extra = { acto, objeto, capital, boletin, personas:[{nombre,cargo}] }
--   osm       extra = { tags, horario }
--   buscador  extra = { titulo, resumen, consulta }
--   lista     extra = { linea }   ← la línea original, para depurar un CSV raro
--
-- `personas` es la misma forma que ya usa el enriquecimiento desde la web, así
-- que la pantalla las pinta igual vengan de un aviso legal o del BORME.
comment on column helm_prospects.extra is
  'Lo que trae cada fuente y no tiene columna: acto y administradores en BORME, '
  'tags de OSM, título y resumen en el buscador. La forma de `personas` es la '
  'misma que la del enriquecimiento web: [{ nombre, cargo, fuente }].';
