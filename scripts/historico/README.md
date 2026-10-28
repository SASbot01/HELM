# Scripts de un solo uso

Ya cumplieron su función; se guardan por si hay que repetir algo parecido.

- `desplegar-agencias.sh` — el despliegue de agencias del 12-oct (migraciones 097–101, ya aplicadas).
- `gen-form-primermap-silvestre.mjs`, `gen-form-valor-silvestre.mjs` — generaron SQL de formularios ya aplicado.
- `seed-silvestre-knowledge.mjs` — usaba la clave anónima, que la migración 098 cerró: ya no funciona.
- `setup-admin-api-key.mjs` — `ADMIN_API_KEY` ya no se usa en ningún sitio.
